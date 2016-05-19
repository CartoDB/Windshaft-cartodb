var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

var IMAGE_TOLERANCE_PER_MIL = 20;

function imageCompareFn(fixture, done) {
    return function(err, res, image) {
        assert.ok(!err, err);
        assert.imageIsSimilarToFile(image, './test/fixtures/' + fixture, IMAGE_TOLERANCE_PER_MIL, done);
    };
}

function makeMapconfig(cartocss) {
    return {
        "version": "1.4.0",
        "layers": [
            {
                "type": 'mapnik',
                "options": {
                    "cartocss_version": '2.3.0',
                    "sql": [
                        'SELECT test_table.*, _prices.price FROM test_table JOIN (' +
                        '  SELECT 1 AS cartodb_id, 10.00 AS price',
                        '  UNION',
                        '  SELECT 2, 10.50',
                        '  UNION',
                        '  SELECT 3, 11.00',
                        '  UNION',
                        '  SELECT 4, 12.00',
                        '  UNION',
                        '  SELECT 5, 21.00',
                        ') _prices ON _prices.cartodb_id = test_table.cartodb_id'
                    ].join('\n'),
                    "cartocss": cartocss
                }
            }
        ]
    };
}

describe('turbo-carto for anonymous maps', function() {
    describe('parsing ramp function with colorbrewer for greens and mapnik renderer', function () {
        beforeEach(function () {
            var turboCartocss = '#layer { marker-fill: ramp([price], colorbrewer(Greens)); }';
            this.testClient = new TestClient(makeMapconfig(turboCartocss));
        });

        afterEach(function (done) {
            this.testClient.drain(done);
        });

        it('should get a tile with turbo-carto parsed properly', function (done) {
            var fixturePath = 'test_turbo_carto_greens_13_4011_3088.png';
            this.testClient.getTile(13, 4011, 3088, imageCompareFn(fixturePath, done));
        });

        it('should work for different char case in quantification names', function(done) {
            this.testClient = new TestClient(
                makeMapconfig('#layer { marker-fill: ramp([price], colorbrewer(Greens, 3), jeNkS); }')
            );
            this.testClient.getLayergroup(function(err, layergroup) {
                assert.ok(!err, err);

                assert.ok(layergroup.hasOwnProperty('layergroupid'));
                assert.ok(!layergroup.hasOwnProperty('errors'));

                done();
            });
        });
    });

    describe('parsing ramp function with colorbrewer for reds and mapnik renderer', function () {
        beforeEach(function () {
            var turboCartocss = '#layer { marker-fill: ramp([price], colorbrewer(Reds)); }';
            this.testClient = new TestClient(makeMapconfig(turboCartocss));
        });

        afterEach(function (done) {
            this.testClient.drain(done);
        });

        it('should get a tile with turbo-carto parsed properly', function (done) {
            var fixtureFileName = 'test_turbo_carto_reds_13_4011_3088.png';
            this.testClient.getTile(13, 4011, 3088, imageCompareFn(fixtureFileName, done));
        });
    });

    describe('parsing ramp function with colorbrewer for greens and toque renderer', function () {
        var mapConfig = {
            version: '1.2.0',
            layers: [
                {
                    type: 'torque',
                    options: {
                        sql: "SELECT * FROM populated_places_simple_reduced where the_geom" +
                            " && ST_MakeEnvelope(-90, 0, 90, 65)",
                        cartocss: [
                            'Map {',
                            '    buffer-size:0;',
                            '    -torque-frame-count:1;',
                            '    -torque-animation-duration:30;',
                            '    -torque-time-attribute:"cartodb_id";',
                            '    -torque-aggregation-function:"count(cartodb_id)";',
                            '    -torque-resolution:1;',
                            '    -torque-data-aggregation:linear;',
                            '};',
                            '#populated_places_simple_reduced {',
                            '    comp-op: multiply;',
                            '    marker-fill-opacity: 1;',
                            '    marker-line-color: #FFF;',
                            '    marker-line-width: 0;',
                            '    marker-line-opacity: 1;',
                            '    marker-type: rectangle;',
                            '    marker-width: 3;',
                            '    marker-fill: ramp([pop_max], colorbrewer(Greens));',
                            '};'
                        ].join(' '),
                        cartocss_version: '2.3.0'
                    }
                }
            ]
        };

        beforeEach(function () {
            this.testClient = new TestClient(mapConfig);
        });

        afterEach(function (done) {
            this.testClient.drain(done);
        });

        it('should get a tile with turbo-carto parsed properly', function (done) {
            var z = 2;
            var x = 2;
            var y = 1;

            var pngFixture = 'torque/populated_places_simple_reduced-turbo-carto-' + [z, x, y].join('.') + '.png';

            this.testClient.getTile(z, x, y, { layers: 0, format: 'torque.png' }, imageCompareFn(pngFixture, done));
        });
    });
});
