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
});
