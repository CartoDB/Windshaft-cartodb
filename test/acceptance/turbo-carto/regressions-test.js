'use strict';

require('../../support/test-helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

function makeMapconfig (sql, cartocss) {
    return {
        version: '1.4.0',
        layers: [
            {
                type: 'mapnik',
                options: {
                    cartocss_version: '2.3.0',
                    sql: sql,
                    cartocss: cartocss
                }
            }
        ]
    };
}

describe('turbo-carto regressions', function () {
    afterEach(function (done) {
        if (this.testClient) {
            this.testClient.drain(done);
        } else {
            done();
        }
    });

    it('should accept // comments', function (done) {
        var cartocss = [
            '/** simple visualization */',
            '',
            'Map {',
            '  buffer-size: 256;',
            '}',
            '',
            '#county_points_with_population{',
            '  marker-fill-opacity: 0.1;',
            '  marker-line-color:#FFFFFF;//#CF1C90;',
            '  marker-line-width: 0;',
            '  marker-line-opacity: 0.3;',
            '  marker-placement: point;',
            '  marker-type: ellipse;',
            '  //marker-comp-op: overlay;',
            '  marker-width: [cartodb_id];',
            '  [zoom=5]{marker-width: [cartodb_id]*2;}',
            '  [zoom=6]{marker-width: [cartodb_id]*4;}',
            '  marker-fill: #000000;',
            '  marker-allow-overlap: true;',
            '  ',
            '',
            '}'
        ].join('\n');

        this.testClient = new TestClient(makeMapconfig('SELECT * FROM populated_places_simple_reduced', cartocss));
        this.testClient.getLayergroup(function (err, layergroup) {
            assert.ok(!err, err);

            assert.ok(Object.prototype.hasOwnProperty.call(layergroup, 'layergroupid'));
            assert.ok(!Object.prototype.hasOwnProperty.call(layergroup, 'errors'));

            done();
        });
    });

    it('should fail for private tables', function (done) {
        var cartocss = [
            '#private_table {',
            '  marker-placement: point;',
            '  marker-allow-overlap: true;',
            '  marker-line-width: 0;',
            '  marker-fill-opacity: 1.0;',
            '  marker-width: ramp([cartodb_id], 10, 20);',
            '  marker-fill: red;',
            '}'
        ].join('\n');

        this.testClient = new TestClient(makeMapconfig('SELECT * FROM test_table_private_1', cartocss));
        this.testClient.getLayergroup({ response: TestClient.RESPONSE.ERROR }, function (err, layergroup) {
            assert.ok(!err, err);

            assert.ok(!Object.prototype.hasOwnProperty.call(layergroup, 'layergroupid'));
            assert.ok(Object.prototype.hasOwnProperty.call(layergroup, 'errors'));

            var turboCartoError = layergroup.errors_with_context[0];
            assert.ok(turboCartoError);
            assert.strictEqual(turboCartoError.type, 'layer');
            assert.ok(turboCartoError.message.match(/permission\sdenied\sfor\s.+?test_table_private_1/));

            done();
        });
    });

    it('should work for private tables with api key', function (done) {
        var cartocss = [
            '#private_table {',
            '  marker-placement: point;',
            '  marker-allow-overlap: true;',
            '  marker-line-width: 0;',
            '  marker-fill-opacity: 1.0;',
            '  marker-width: ramp([cartodb_id], 10, 20);',
            '  marker-fill: red;',
            '}'
        ].join('\n');

        this.testClient = new TestClient(makeMapconfig('SELECT * FROM test_table_private_1', cartocss), 1234);
        this.testClient.getLayergroup(function (err, layergroup) {
            assert.ok(!err, err);

            assert.ok(Object.prototype.hasOwnProperty.call(layergroup, 'layergroupid'));
            assert.ok(!Object.prototype.hasOwnProperty.call(layergroup, 'errors'));

            done();
        });
    });

    it('should work with mapnik substitution tokens', function (done) {
        var cartocss = [
            '#layer {',
            '  line-width: 2;',
            '  line-color: #3B3B58;',
            '  line-opacity: 1;',
            '  polygon-opacity: 0.7;',
            '  polygon-fill: ramp([points_count], (#E5F5F9,#99D8C9,#2CA25F))',
            '}'
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
        this.testClient.getLayergroup(function (err, layergroup) {
            assert.ok(!err, err);

            assert.ok(Object.prototype.hasOwnProperty.call(layergroup, 'layergroupid'));
            assert.ok(!Object.prototype.hasOwnProperty.call(layergroup, 'errors'));

            done();
        });
    });

    it('should work with mapnik substitution tokens and analyses', function (done) {
        var cartocss = [
            '#layer {',
            '  line-width: 2;',
            '  line-color: #3B3B58;',
            '  line-opacity: 1;',
            '  polygon-opacity: 0.7;',
            '  polygon-fill: ramp([points_count], (#E5F5F9,#99D8C9,#2CA25F))',
            '}'
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
            version: '1.5.0',
            layers: [
                {
                    type: 'mapnik',
                    options: {
                        cartocss_version: '2.3.0',
                        source: {
                            id: 'head'
                        },
                        sql_wrap: sqlWrap,
                        cartocss: cartocss
                    }
                }
            ],
            analyses: [
                {
                    id: 'head',
                    type: 'source',
                    params: {
                        query: 'SELECT * FROM populated_places_simple_reduced'
                    }
                }
            ]
        };

        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getLayergroup(function (err, layergroup) {
            assert.ok(!err, err);

            assert.ok(Object.prototype.hasOwnProperty.call(layergroup, 'layergroupid'));
            assert.ok(!Object.prototype.hasOwnProperty.call(layergroup, 'errors'));

            done();
        });
    });

    describe('empty datasource results', function () {
        afterEach(function (done) {
            if (this.testClient) {
                this.testClient.drain(done);
            } else {
                done();
            }
        });

        function emptyResultMapConfig (markerFillRule) {
            var cartocss = [
                '#county_points_with_population {',
                '  marker-placement: point;',
                '  marker-allow-overlap: true;',
                '  marker-fill-opacity: 1.0;',
                '  marker-fill: ' + markerFillRule + ';',
                '  marker-line-width: 0;',
                '}'
            ].join('\n');

            return {
                version: '1.5.0',
                layers: [
                    {
                        type: 'mapnik',
                        options: {
                            cartocss_version: '2.3.0',
                            source: {
                                id: 'head'
                            },
                            cartocss: cartocss
                        }
                    }
                ],
                analyses: [
                    {
                        id: 'head',
                        type: 'source',
                        params: {
                            query: 'SELECT * FROM populated_places_simple_reduced limit 0'
                        }
                    }
                ]
            };
        }

        var methods = ['quantiles', 'equal', 'jenks', 'headtails', 'category'];

        methods.forEach(function (method) {
            it('should work for "' + method + '" method', function (done) {
                var makerFillRule = 'ramp([pop_max], (#E5F5F9,#99D8C9,#2CA25F), ' + method + ')';

                this.testClient = new TestClient(emptyResultMapConfig(makerFillRule), 1234);
                this.testClient.getLayergroup(function (err, layergroup) {
                    assert.ok(!err, err);

                    assert.ok(Object.prototype.hasOwnProperty.call(layergroup, 'layergroupid'));
                    assert.ok(!Object.prototype.hasOwnProperty.call(layergroup, 'errors'));

                    done();
                });
            });
        });
    });

    var scenarios = [
        {
            desc: 'numeric datasource',
            cartocss: [
                '#points {',
                '  marker-fill: ramp([scalerank], colorbrewer(Reds), category);',
                '}'
            ].join('\n'),
            expected: [
                '#points {',
                '  marker-fill: #fee5d9;',
                '  [ scalerank = 6 ] {',
                '    marker-fill: #fcae91',
                '  }',
                '  [ scalerank = 8 ] {',
                '    marker-fill: #fb6a4a',
                '  }',
                '  [ scalerank = 4 ] {',
                '    marker-fill: #de2d26',
                '  }',
                '  [ scalerank = 10 ] {',
                '    marker-fill: #a50f15',
                '  }',
                '}'
            ].join('\n')
        },
        {
            desc: 'string datasource',
            cartocss: [
                '#points {',
                '  marker-fill: ramp([adm0name], colorbrewer(Reds), category);',
                '}'
            ].join('\n'),
            expected: [
                '#points {',
                '  marker-fill: #fee5d9;',
                '  [ adm0name = "Russia" ] {',
                '    marker-fill: #fcae91',
                '  }',
                '  [ adm0name = "China" ] {',
                '    marker-fill: #fb6a4a',
                '  }',
                '  [ adm0name = "Brazil" ] {',
                '    marker-fill: #de2d26',
                '  }',
                '  [ adm0name = "Canada" ] {',
                '    marker-fill: #a50f15',
                '  }',
                '}'
            ].join('\n')
        },
        {
            desc: 'numeric manual',
            cartocss: [
                '#points {',
                '  marker-fill: ramp([scalerank], colorbrewer(Reds), (-1, 6, 8, 4, 10), category);',
                '}'
            ].join('\n'),
            expected: [
                '#points {',
                '  marker-fill: #fee5d9;',
                '  [ scalerank = 6 ] {',
                '    marker-fill: #fcae91',
                '  }',
                '  [ scalerank = 8 ] {',
                '    marker-fill: #fb6a4a',
                '  }',
                '  [ scalerank = 4 ] {',
                '    marker-fill: #de2d26',
                '  }',
                '  [ scalerank = 10 ] {',
                '    marker-fill: #a50f15',
                '  }',
                '}'
            ].join('\n')
        }
    ];

    scenarios.forEach(function (scenario) {
        it('category ramps should use original type: ' + scenario.desc, function (done) {
            var mapConfig = makeMapconfig('SELECT * FROM populated_places_simple_reduced', scenario.cartocss);
            this.testClient = new TestClient(mapConfig);
            this.testClient.getLayergroup(function (err, layergroup) {
                assert.ok(!err, err);

                assert.ok(Object.prototype.hasOwnProperty.call(layergroup, 'layergroupid'));
                assert.deepStrictEqual(layergroup.metadata.layers[0].meta.cartocss, scenario.expected);

                done();
            });
        });
    });

    describe('Buckets calculation', function () {
        afterEach(function (done) {
            if (this.testClient) {
                this.testClient.drain(done);
            } else {
                done();
            }
        });

        const scenarios = [
            {
                numBuckets: 1,
                bucketResponse: [
                    {
                        filter: {
                            type: 'range',
                            start: 0,
                            end: 8
                        },
                        value: 1
                    }
                ]
            },
            {
                numBuckets: 2,
                bucketResponse: [
                    {
                        filter: {
                            type: 'range',
                            start: 0,
                            end: 3
                        },
                        value: 1
                    },
                    {
                        filter: {
                            type: 'range',
                            start: 3,
                            end: 8
                        },
                        value: 20
                    }
                ]
            },
            {
                numBuckets: 3,
                bucketResponse: [
                    {
                        filter: {
                            type: 'range',
                            start: 0,
                            end: 2
                        },
                        value: 1
                    },
                    {
                        filter: {
                            type: 'range',
                            start: 2,
                            end: 5
                        },
                        value: 10.5
                    },
                    {
                        filter: {
                            type: 'range',
                            start: 5,
                            end: 8
                        },
                        value: 20
                    }
                ]
            }
        ];

        scenarios.forEach(function (scenario) {
            it('Buckets: ' + scenario.numBuckets, function (done) {
                const bucketsMapConfig = makeMapconfig({ numQuantiles: scenario.numBuckets });

                this.testClient = new TestClient(bucketsMapConfig);
                this.testClient.getLayergroup({ response: OK_RESPONSE }, function (err, layergroup) {
                    const rule = layergroup.metadata.layers[0].meta.cartocss_meta.rules[0];

                    assert.ok(!err, err);
                    assert.strictEqual(rule.buckets.length, scenario.numBuckets);
                    assert.deepStrictEqual(rule.buckets, scenario.bucketResponse);

                    done();
                });
            });
        });

        function makeMapconfig ({ numQuantiles = 1 }) {
            return {
                version: '1.4.0',
                layers: [
                    {
                        type: 'mapnik',
                        options: {
                            cartocss_version: '2.3.0',
                            sql: 'SELECT * FROM populated_places_simple_reduced',
                            cartocss: `#layer {\n
                                        marker-width: ramp([labelrank], range(1, 20), quantiles(${numQuantiles}));\n
                                        marker-fill: #EE4D5A;\n  marker-fill-opacity: 0.9;\n
                                        marker-allow-overlap: true;\n  marker-line-width: 1;\n
                                        marker-line-color: #FFFFFF;\n  marker-line-opacity: 1;\n}`
                        }
                    }
                ]
            };
        }

        const OK_RESPONSE = {
            status: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            }
        };
    });
});
