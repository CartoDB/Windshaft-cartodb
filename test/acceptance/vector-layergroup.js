require('../support/test_helper');

const assert = require('../support/assert');
const TestClient = require('../support/test-client');
const serverOptions = require('../../lib/cartodb/server_options');


const POINTS_SQL_1 = `
select
    st_setsrid(st_makepoint(x*10, x*10), 4326) as the_geom,
    st_transform(st_setsrid(st_makepoint(x*10, x*10), 4326), 3857) as the_geom_webmercator,
    x as value
from generate_series(-3, 3) x
`;

const POINTS_SQL_2 = `
select
    st_setsrid(st_makepoint(x*10, x*10*(-1)), 4326) as the_geom,
    st_transform(st_setsrid(st_makepoint(x*10, x*10*(-1)), 4326), 3857) as the_geom_webmercator,
    x as value
from generate_series(-3, 3) x
`;

function createVectorLayergroup () {
    return {
        version: '1.6.0',
        layers: [
            {
                type: 'cartodb',
                options: {
                    sql: POINTS_SQL_1
                }
            },
            {
                type: 'cartodb',
                options: {
                    sql: POINTS_SQL_2
                }
            }
        ]
    };
}

const INCOMPATIBLE_LAYERS_ERROR = {
    "errors": [
        "The layergroup contains incompatible layers: " +
            "don't mix styled layers with non styled layers (without cartocss)"
    ],
    "errors_with_context":[
        {
            "type":"layergroup",
            "message": "The layergroup contains incompatible layers: " +
                "don't mix styled layers with non styled layers (without cartocss)"
        }
    ]
};

const INVALID_FORMAT_ERROR = {
    "errors": [
        "Invalid format: only mvt format is available for layers without CartoCSS defined"
    ],
    "errors_with_context":[
        {
            "type": "tile",
            "message": "Invalid format:" +
                " only mvt format is available for layers without CartoCSS defined"
        }
    ]
};

const suites = [{
    desc: 'mvt (mapnik)',
    usePostGIS: false
}];

if (process.env.POSTGIS_VERSION === '2.4') {
    suites.push({
        desc: 'mvt (postgis)',
        usePostGIS: true
    });
}

suites.forEach((suite) => {
    const { desc, usePostGIS } = suite;

    describe(desc, function () {
        const originalUsePostGIS = serverOptions.renderer.mvt.usePostGIS;

        before(function () {
            serverOptions.renderer.mvt.usePostGIS = usePostGIS;
        });

        after(function (){
            serverOptions.renderer.mvt.usePostGIS = originalUsePostGIS;
        });

        describe('vector-layergroup', function () {
            beforeEach(function () {
                this.mapConfig = createVectorLayergroup();
                this.testClient = new TestClient(this.mapConfig);
            });

            afterEach(function (done) {
                this.testClient.drain(done);
            });

            it('should get vector tiles from layergroup with layers w/o cartocss', function (done) {
                this.testClient.getTile(0, 0, 0, { format: 'mvt' }, (err, res, tile) => {
                    if (err) {
                        return done(err);
                    }

                    assert.equal(tile.tileSize, 4096);
                    assert.equal(tile.z, 0);
                    assert.equal(tile.x, 0);
                    assert.equal(tile.y, 0);

                    const layer0 = JSON.parse(tile.toGeoJSONSync(0));

                    assert.equal(layer0.name, 'layer0');
                    assert.equal(layer0.features[0].type, 'Feature');
                    assert.equal(layer0.features[0].geometry.type, 'Point');

                    const layer1 = JSON.parse(tile.toGeoJSONSync(1));

                    assert.equal(layer1.name, 'layer1');
                    assert.equal(layer1.features[0].type, 'Feature');
                    assert.equal(layer1.features[0].geometry.type, 'Point');
                    done();
                });
            });

            it('should get vector tiles from specific layer (layer0)', function (done) {
                this.testClient.getTile(0, 0, 0, { format: 'mvt', layers: 0 }, (err, res, tile) => {
                    if (err) {
                        return done(err);
                    }

                    assert.equal(tile.tileSize, 4096);
                    assert.equal(tile.z, 0);
                    assert.equal(tile.x, 0);
                    assert.equal(tile.y, 0);

                    const layer = JSON.parse(tile.toGeoJSONSync(0));

                    assert.equal(layer.name, 'layer0');
                    assert.equal(layer.features[0].type, 'Feature');
                    assert.equal(layer.features[0].geometry.type, 'Point');

                    done();
                });
            });

            it('should get vector tiles from specific layer (layer1)', function (done) {
                this.testClient.getTile(0, 0, 0, { format: 'mvt', layers: 1 }, (err, res, tile) => {
                    if (err) {
                        return done(err);
                    }

                    assert.equal(tile.tileSize, 4096);
                    assert.equal(tile.z, 0);
                    assert.equal(tile.x, 0);
                    assert.equal(tile.y, 0);

                    const layer = JSON.parse(tile.toGeoJSONSync(0));

                    assert.equal(layer.name, 'layer1');
                    assert.equal(layer.features[0].type, 'Feature');
                    assert.equal(layer.features[0].geometry.type, 'Point');

                    done();
                });
            });

            it('should fail when the format requested is not mvt', function (done) {
                const options = {
                    format: 'png',
                    response: {
                        status: 400,
                        headers: {
                            'Content-Type': 'application/json; charset=utf-8'
                        }
                    }
                };

                this.testClient.getTile(0, 0, 0, options, (err, res, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.deepEqual(body, INVALID_FORMAT_ERROR);
                    done();
                });
            });

            it('should fail when the map-config mix layers with and without cartocss', function (done) {
                const response = {
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8'
                    }
                };

                const cartocss = `#layer0 { marker-fill: red; marker-width: 10; }`;
                const cartocssVersion = '2.3.0';

                this.testClient.mapConfig.layers[0].options.cartocss = cartocss;
                this.testClient.mapConfig.layers[0].options.cartocss_version = cartocssVersion;

                this.testClient.getLayergroup(response, (err, body) => {
                    if (err) {
                        return done(err);
                    }

                    assert.deepEqual(body, INCOMPATIBLE_LAYERS_ERROR);

                    done();
                });
            });
        });
    });
});
