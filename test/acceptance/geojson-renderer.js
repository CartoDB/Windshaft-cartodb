require('../support/test_helper');

var assert = require('../support/assert');
var TestClient = require('../support/test-client');


describe('use only needed columns', function() {

    function getFeatureByCartodbId(features, cartodbId) {
        for (var i = 0, len = features.length; i < len; i++) {
            if (features[i].properties.cartodb_id === cartodbId) {
                return features[i];
            }
        }
        return {};
    }

    var options = { format: 'geojson', layer: 0 };

    afterEach(function(done) {
        if (this.testClient) {
            this.testClient.drain(done);
        } else {
            done();
        }
    });

    it('with aggregation widget, interactivity and cartocss columns', function(done) {
        var widgetMapConfig = {
            version: '1.5.0',
            layers: [{
                type: 'mapnik',
                options: {
                    sql: 'select * from populated_places_simple_reduced',
                    cartocss: '#layer0 { marker-fill: red; marker-width: 10; [name="Madrid"] { marker-fill: green; } }',
                    cartocss_version: '2.0.1',
                    widgets: {
                        adm0name: {
                            type: 'aggregation',
                            options: {
                                column: 'adm0name',
                                aggregation: 'sum',
                                aggregationColumn: 'pop_max'
                            }
                        }
                    },
                    interactivity: "cartodb_id,pop_min"
                }
            }]
        };

        this.testClient = new TestClient(widgetMapConfig);
        this.testClient.getTile(0, 0, 0, options, function (err, res, geojsonTile) {
            assert.ok(!err, err);
            assert.deepEqual(getFeatureByCartodbId(geojsonTile.features, 1109).properties, {
                cartodb_id: 1109,
                name: 'Mardin',
                adm0name: 'Turkey',
                pop_max: 71373,
                pop_min: 57586
            });
            done();
        });
    });

    it('should not duplicate columns', function(done) {
        var widgetMapConfig = {
            version: '1.5.0',
            layers: [{
                type: 'mapnik',
                options: {
                    sql: 'select * from populated_places_simple_reduced',
                    cartocss: ['#layer0 {',
                        'marker-fill: red;',
                        'marker-width: 10;',
                        '[name="Madrid"] { marker-fill: green; } ',
                        '[pop_max>100000] { marker-fill: black; } ',
                        '}'].join('\n'),
                    cartocss_version: '2.3.0',
                    widgets: {
                        adm0name: {
                            type: 'aggregation',
                            options: {
                                column: 'adm0name',
                                aggregation: 'sum',
                                aggregationColumn: 'pop_max'
                            }
                        }
                    },
                    interactivity: "cartodb_id,pop_max"
                }
            }]
        };

        this.testClient = new TestClient(widgetMapConfig);
        this.testClient.getTile(0, 0, 0, options, function (err, res, geojsonTile) {
            assert.ok(!err, err);
            assert.deepEqual(getFeatureByCartodbId(geojsonTile.features, 1109).properties, {
                cartodb_id: 1109,
                name: 'Mardin',
                adm0name: 'Turkey',
                pop_max: 71373
            });
            done();
        });
    });

    it('with formula widget, no interactivity and no cartocss columns', function(done) {
        var formulaWidgetMapConfig = {
            version: '1.5.0',
            layers: [{
                type: 'mapnik',
                options: {
                    sql: 'select * from populated_places_simple_reduced where pop_max > 0 and pop_max < 600000',
                    cartocss: '#layer0 { marker-fill: red; marker-width: 10; }',
                    cartocss_version: '2.0.1',
                    interactivity: 'cartodb_id',
                    widgets: {
                        pop_max_f: {
                            type: 'formula',
                            options: {
                                column: 'pop_max',
                                operation: 'count'
                            }
                        }
                    }
                }
            }]
        };

        this.testClient = new TestClient(formulaWidgetMapConfig);
        this.testClient.getTile(0, 0, 0, options, function (err, res, geojsonTile) {
            assert.ok(!err, err);
            assert.deepEqual(getFeatureByCartodbId(geojsonTile.features, 1109).properties, {
                cartodb_id: 1109,
                pop_max: 71373
            });
            done();
        });
    });
    it('with cartocss with multiple expressions', function(done) {
        var formulaWidgetMapConfig = {
            version: '1.5.0',
            layers: [{
                type: 'mapnik',
                options: {
                    sql: 'select * from populated_places_simple_reduced where pop_max > 0 and pop_max < 600000',
                    cartocss: '#layer0 { marker-fill: red; marker-width: 10; }' +
                        '#layer0 { marker-width: 14; [name="Madrid"] { marker-width: 20; } }' +
                        '#layer0[pop_max>1000] { marker-width: 14; [name="Madrid"] { marker-width: 20; } }' +
                        '#layer0[adm0name=~".*Turkey*"] { marker-width: 14; [name="Madrid"] { marker-width: 20; } }',
                    cartocss_version: '2.0.1',
                    interactivity: 'cartodb_id'
                }
            }]
        };

        this.testClient = new TestClient(formulaWidgetMapConfig);
        this.testClient.getTile(0, 0, 0, options, function (err, res, geojsonTile) {
            assert.ok(!err, err);
            assert.deepEqual(getFeatureByCartodbId(geojsonTile.features, 1109).properties, {
                cartodb_id: 1109,
                pop_max:71373,
                name:"Mardin",
                adm0name:"Turkey"
            });
            done();
        });
    });

});