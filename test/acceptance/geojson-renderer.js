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

    it('should work with mapnik substitution tokens', function(done) {
        var cartocss = [
            "#layer {",
            "  line-width: 2;",
            "  line-color: #3B3B58;",
            "  line-opacity: 1;",
            "  polygon-opacity: 0.7;",
            "  polygon-fill: ramp([points_count], (#E5F5F9,#99D8C9,#2CA25F))",
            "}"
        ].join('\n');

        var sql = [
            'WITH hgrid AS (',
            '  SELECT CDB_HexagonGrid(',
            '    ST_Expand(!bbox!, greatest(!pixel_width!,!pixel_height!) * 100),',
            '    greatest(!pixel_width!,!pixel_height!) * 100',
            '  ) as cell',
            ')',
            'SELECT',
            '  hgrid.cell as the_geom_webmercator,',
            '  count(1) as points_count,',
            '  count(1)/power(100 * CDB_XYZ_Resolution(CDB_ZoomFromScale(!scale_denominator!)), 2) as points_density,',
            '  1 as cartodb_id',
            'FROM hgrid, (SELECT * FROM populated_places_simple_reduced) i',
            'where ST_Intersects(i.the_geom_webmercator, hgrid.cell)',
            'GROUP BY hgrid.cell'
        ].join('\n');

        var mapConfig = {
            "version": "1.4.0",
            "layers": [
                {
                    "type": 'mapnik',
                    "options": {
                        "cartocss_version": '2.3.0',
                        "sql": sql,
                        "cartocss": cartocss
                    }
                }
            ]
        };

        this.testClient = new TestClient(mapConfig);
        this.testClient.getTile(0, 0, 0, { format: 'geojson', layer: 0 }, function(err, res, geojson) {
            assert.ok(!err, err);

            assert.ok(geojson);
            assert.equal(geojson.features.length, 5);

            done();
        });
    });

});
