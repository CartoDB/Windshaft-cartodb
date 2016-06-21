require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

function makeMapconfig(sql, cartocss) {
    return {
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
}

describe('turbo-carto regressions', function() {

    afterEach(function (done) {
        if (this.testClient) {
            this.testClient.drain(done);
        } else {
            done();
        }
    });

    it('should accept // comments', function(done) {
        var cartocss = [
            "/** simple visualization */",
            "",
            "Map {",
            "  buffer-size: 256;",
            "}",
            "",
            "#county_points_with_population{",
            "  marker-fill-opacity: 0.1;",
            "  marker-line-color:#FFFFFF;//#CF1C90;",
            "  marker-line-width: 0;",
            "  marker-line-opacity: 0.3;",
            "  marker-placement: point;",
            "  marker-type: ellipse;",
            "  //marker-comp-op: overlay;",
            "  marker-width: [cartodb_id];",
            "  [zoom=5]{marker-width: [cartodb_id]*2;}",
            "  [zoom=6]{marker-width: [cartodb_id]*4;}",
            "  marker-fill: #000000;",
            "  marker-allow-overlap: true;",
            "  ",
            "",
            "}"
        ].join('\n');

        this.testClient = new TestClient(makeMapconfig('SELECT * FROM populated_places_simple_reduced', cartocss));
        this.testClient.getLayergroup(function(err, layergroup) {
            assert.ok(!err, err);

            assert.ok(layergroup.hasOwnProperty('layergroupid'));
            assert.ok(!layergroup.hasOwnProperty('errors'));

            done();
        });
    });

    it('should fail for private tables', function(done) {
        var cartocss = [
            "#private_table {",
            "  marker-placement: point;",
            "  marker-allow-overlap: true;",
            "  marker-line-width: 0;",
            "  marker-fill-opacity: 1.0;",
            "  marker-width: ramp([cartodb_id], 10, 20);",
            "  marker-fill: red;",
            "}"
        ].join('\n');

        this.testClient = new TestClient(makeMapconfig('SELECT * FROM test_table_private_1', cartocss));
        this.testClient.getLayergroup(TestClient.RESPONSE.ERROR, function(err, layergroup) {
            assert.ok(!err, err);

            assert.ok(!layergroup.hasOwnProperty('layergroupid'));
            assert.ok(layergroup.hasOwnProperty('errors'));

            var turboCartoError = layergroup.errors_with_context[0];
            assert.ok(turboCartoError);
            assert.equal(turboCartoError.type, 'turbo-carto');
            assert.ok(turboCartoError.message.match(/permission\sdenied\sfor\srelation\stest_table_private_1/));

            done();
        });
    });

    it('should work for private tables with api key', function(done) {
        var cartocss = [
            "#private_table {",
            "  marker-placement: point;",
            "  marker-allow-overlap: true;",
            "  marker-line-width: 0;",
            "  marker-fill-opacity: 1.0;",
            "  marker-width: ramp([cartodb_id], 10, 20);",
            "  marker-fill: red;",
            "}"
        ].join('\n');

        this.testClient = new TestClient(makeMapconfig('SELECT * FROM test_table_private_1', cartocss), 1234);
        this.testClient.getLayergroup(function(err, layergroup) {
            assert.ok(!err, err);

            assert.ok(layergroup.hasOwnProperty('layergroupid'));
            assert.ok(!layergroup.hasOwnProperty('errors'));

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

        this.testClient = new TestClient(makeMapconfig(sql, cartocss));
        this.testClient.getLayergroup(function(err, layergroup) {
            assert.ok(!err, err);

            assert.ok(layergroup.hasOwnProperty('layergroupid'));
            assert.ok(!layergroup.hasOwnProperty('errors'));

            done();
        });
    });

    it('should work with mapnik substitution tokens and analyses', function(done) {
        var cartocss = [
            "#layer {",
            "  line-width: 2;",
            "  line-color: #3B3B58;",
            "  line-opacity: 1;",
            "  polygon-opacity: 0.7;",
            "  polygon-fill: ramp([points_count], (#E5F5F9,#99D8C9,#2CA25F))",
            "}"
        ].join('\n');

        var sqlWrap = [
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
            'FROM hgrid, (<%= sql %>) i',
            'where ST_Intersects(i.the_geom_webmercator, hgrid.cell)',
            'GROUP BY hgrid.cell'
        ].join('\n');

        var mapConfig = {
            "version": "1.5.0",
            "layers": [
                {
                    "type": 'mapnik',
                    "options": {
                        "cartocss_version": '2.3.0',
                        "source": {
                            "id": "head"
                        },
                        sql_wrap: sqlWrap,
                        "cartocss": cartocss
                    }
                }
            ],
            "analyses": [
                {
                    "id": "head",
                    "type": "source",
                    "params": {
                        "query": "SELECT * FROM populated_places_simple_reduced"
                    }
                }
            ]
        };

        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getLayergroup(function(err, layergroup) {
            assert.ok(!err, err);

            assert.ok(layergroup.hasOwnProperty('layergroupid'));
            assert.ok(!layergroup.hasOwnProperty('errors'));

            done();
        });
    });

    describe('empty datasource results', function() {

        afterEach(function (done) {
            if (this.testClient) {
                this.testClient.drain(done);
            } else {
                done();
            }
        });

        function emptyResultMapConfig(markerFillRule) {
            var cartocss = [
                "#county_points_with_population {",
                "  marker-placement: point;",
                "  marker-allow-overlap: true;",
                "  marker-fill-opacity: 1.0;",
                "  marker-fill: " + markerFillRule + ';',
                "  marker-line-width: 0;",
                "}"
            ].join('\n');

            return {
                "version": "1.5.0",
                "layers": [
                    {
                        "type": 'mapnik',
                        "options": {
                            "cartocss_version": '2.3.0',
                            "source": {
                                "id": "head"
                            },
                            "cartocss": cartocss
                        }
                    }
                ],
                "analyses": [
                    {
                        "id": "head",
                        "type": "source",
                        "params": {
                            "query": "SELECT * FROM populated_places_simple_reduced limit 0"
                        }
                    }
                ]
            };
        }

        it('should work for numeric ramps', function(done) {

            var makerFillRule = 'ramp([pop_max], (#E5F5F9,#99D8C9,#2CA25F), jenks)';

            this.testClient = new TestClient(emptyResultMapConfig(makerFillRule), 1234);
            this.testClient.getLayergroup(function(err, layergroup) {
                assert.ok(!err, err);

                assert.ok(layergroup.hasOwnProperty('layergroupid'));
                assert.ok(!layergroup.hasOwnProperty('errors'));

                done();
            });
        });

        it('should work for category ramps', function(done) {

            var makerFillRule = 'ramp([adm0name], (#E5F5F9,#99D8C9,#2CA25F), category)';

            this.testClient = new TestClient(emptyResultMapConfig(makerFillRule), 1234);
            this.testClient.getLayergroup(function(err, layergroup) {
                assert.ok(!err, err);

                assert.ok(layergroup.hasOwnProperty('layergroupid'));
                assert.ok(!layergroup.hasOwnProperty('errors'));

                done();
            });
        });
    });

});
