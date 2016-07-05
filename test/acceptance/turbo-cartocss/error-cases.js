require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

function makeMapconfig(markerWidth, markerFill) {
    return {
        "version": "1.4.0",
        "layers": [
            {
                "type": 'mapnik',
                "options": {
                    "cartocss_version": '2.3.0',
                    "sql": 'SELECT * FROM populated_places_simple_reduced',
                    "cartocss": createCartocss(markerWidth, markerFill)
                }
            }
        ]
    };
}

function createCartocss(markerWidth, markerFill) {
    return [
        "#populated_places_simple_reduced {",
        "  marker-fill-opacity: 0.9;",
        "  marker-line-color: #FFF;",
        "  marker-line-width: 1;",
        "  marker-line-opacity: 1;",
        "  marker-placement: point;",
        "  marker-type: ellipse;",
        "  marker-allow-overlap: true;",
        "  marker-width: " + (markerWidth || '10') + ";",
        "  marker-fill: " + (markerFill || 'red') + ";",
        "}"
    ].join('\n');
}

var ERROR_RESPONSE = {
    status: 400,
    headers: {
        'Content-Type': 'application/json; charset=utf-8'
    }
};

describe('turbo-carto error cases', function() {
    afterEach(function (done) {
        if (this.testClient) {
            this.testClient.drain(done);
        }
    });

    it('should return invalid number of ramp error', function(done) {
        this.testClient = new TestClient(makeMapconfig('ramp([pop_max], (8,24,96), (8,24,96,128))'));
        this.testClient.getLayergroup(ERROR_RESPONSE, function(err, layergroup) {
            assert.ok(!err, err);

            assert.ok(layergroup.hasOwnProperty('errors'));
            assert.equal(layergroup.errors.length, 1);
            assert.ok(layergroup.errors[0].match(/^turbo-carto/));
            assert.ok(layergroup.errors[0].match(/invalid\sramp\slength/i));

            done();
        });
    });

    it('should return invalid column from datasource', function(done) {
        this.testClient = new TestClient(makeMapconfig(null, 'ramp([wadus_column], (red, green, blue))'));
        this.testClient.getLayergroup(ERROR_RESPONSE, function(err, layergroup) {
            assert.ok(!err, err);

            assert.ok(layergroup.hasOwnProperty('errors'));
            assert.equal(layergroup.errors.length, 1);
            assert.ok(layergroup.errors[0].match(/^turbo-carto/));
            assert.ok(layergroup.errors[0].match(/unable\sto\scompute\sramp/i));
            assert.ok(layergroup.errors[0].match(/wadus_column/));

            done();
        });
    });

    it('should return invalid method from datasource', function(done) {
        this.testClient = new TestClient(makeMapconfig(null, 'ramp([wadus_column], (red, green, blue), wadusmethod)'));
        this.testClient.getLayergroup(ERROR_RESPONSE, function(err, layergroup) {
            assert.ok(!err, err);

            assert.ok(layergroup.hasOwnProperty('errors'));
            assert.equal(layergroup.errors.length, 1);
            assert.ok(layergroup.errors[0].match(/^turbo-carto/));
            assert.ok(layergroup.errors[0].match(/unable\sto\scompute\sramp/i));
            assert.ok(layergroup.errors[0].match(/invalid\smethod\s\"wadusmethod\"/i));

            done();
        });
    });

    it('should fail by falling back to normal carto parser', function(done) {
        this.testClient = new TestClient(makeMapconfig('ramp([price], (8,24,96), (8,24,96));//(red, green, blue))'));
        this.testClient.getLayergroup(ERROR_RESPONSE, function(err, layergroup) {
            assert.ok(!err, err);

            assert.ok(layergroup.hasOwnProperty('errors'));
            assert.equal(layergroup.errors.length, 1);
            assert.ok(!layergroup.errors[0].match(/^turbo-carto/));
            assert.ok(layergroup.errors[0].match(/invalid\scode/i));

            done();
        });
    });

    it('turbo-carto: should return error invalid column from datasource with some context', function(done) {
        this.testClient = new TestClient(makeMapconfig(null, 'ramp([wadus_column], (red, green, blue))'));
        this.testClient.getLayergroup(ERROR_RESPONSE, function(err, layergroup) {
            assert.ok(!err, err);

            assert.ok(layergroup.hasOwnProperty('errors'));
            assert.equal(layergroup.errors_with_context.length, 1);
            assert.equal(layergroup.errors_with_context[0].type, 'layer');
            assert.equal(layergroup.errors_with_context[0].subtype, 'turbo-carto');
            assert.ok(layergroup.errors_with_context[0].message.match(/^turbo-carto/));
            assert.ok(layergroup.errors_with_context[0].message.match(/unable\sto\scompute\sramp/i));
            assert.ok(layergroup.errors_with_context[0].message.match(/wadus_column/));

            assert.equal(layergroup.errors_with_context[0].layer.id, 'layer0');
            assert.equal(layergroup.errors_with_context[0].layer.index, 0);
            assert.equal(layergroup.errors_with_context[0].layer.type, 'mapnik');

            assert.equal(layergroup.errors_with_context[0].layer.context.selector, '#populated_places_simple_reduced');
            assert.deepEqual(layergroup.errors_with_context[0].layer.context.source, {
                start: {
                    line: 10,
                    column: 3
                },
                end: {
                    line: 10,
                    column: 56
                }
            });
            done();
        });
    });

    it('should return multiple errors', function(done) {

        var multipleErrorsMapConfig = {
            "version": "1.4.0",
            "layers": [
                {
                    "type": 'mapnik',
                    "options": {
                        "cartocss_version": '2.3.0',
                        "sql": 'SELECT * FROM populated_places_simple_reduced',
                        "cartocss": createCartocss(null, 'ramp([wadus_column], (red, green, blue))')
                    }
                },
                {
                    "type": 'mapnik',
                    "options": {
                        "cartocss_version": '2.3.0',
                        "sql": 'SELECT * FROM populated_places_simple_reduced',
                        "cartocss": createCartocss('ramp([invalid_column], (red, green, blue))')
                    }
                }
            ]
        };

        this.testClient = new TestClient(multipleErrorsMapConfig);
        this.testClient.getLayergroup(ERROR_RESPONSE, function(err, layergroup) {
            assert.ok(!err, err);

            assert.ok(layergroup.hasOwnProperty('errors'));
            assert.equal(layergroup.errors_with_context.length, 2);

            assert.equal(layergroup.errors_with_context[0].type, 'layer');
            assert.equal(layergroup.errors_with_context[0].subtype, 'turbo-carto');
            assert.ok(layergroup.errors_with_context[0].message.match(/^turbo-carto/));
            assert.ok(layergroup.errors_with_context[0].message.match(/unable\sto\scompute\sramp/i));
            assert.ok(layergroup.errors_with_context[0].message.match(/wadus_column/));
            assert.equal(layergroup.errors_with_context[0].layer.id, 'layer0');

            assert.equal(layergroup.errors_with_context[1].type, 'layer');
            assert.equal(layergroup.errors_with_context[1].subtype, 'turbo-carto');
            assert.ok(layergroup.errors_with_context[1].message.match(/^turbo-carto/));
            assert.ok(layergroup.errors_with_context[1].message.match(/unable\sto\scompute\sramp/i));
            assert.ok(layergroup.errors_with_context[1].message.match(/invalid_column/));
            assert.equal(layergroup.errors_with_context[1].layer.id, 'layer1');

            done();
        });
    });
});
