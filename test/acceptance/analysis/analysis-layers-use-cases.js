require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');
var dot = require('dot');

describe('analysis-layers use cases', function() {


    var multitypeStyleTemplate = dot.template([
        "#points['mapnik::geometry_type'=1] {",
        "  marker-fill-opacity: {{=it._opacity}};",
        "  marker-line-color: #FFF;",
        "  marker-line-width: 0.5;",
        "  marker-line-opacity: {{=it._opacity}};",
        "  marker-placement: point;",
        "  marker-type: ellipse;",
        "  marker-width: 8;",
        "  marker-fill: {{=it._color}};",
        "  marker-allow-overlap: true;",
        "}",
        "#lines['mapnik::geometry_type'=2] {",
        "  line-color: {{=it._color}};",
        "  line-width: 2;",
        "  line-opacity: {{=it._opacity}};",
        "}",
        "#polygons['mapnik::geometry_type'=3] {",
        "  polygon-fill: {{=it._color}};",
        "  polygon-opacity: {{=it._opacity}};",
        "  line-color: #FFF;",
        "  line-width: 0.5;",
        "  line-opacity: {{=it._opacity}};",
        "}"
    ].join('\n'));


    function cartocss(color, opacity) {
        return multitypeStyleTemplate({
            _color: color || '#F11810',
            _opacity: Number.isFinite(opacity) ? opacity : 1
        });
    }

    function mapConfig(layers, analysis) {
        return {
            version: '1.5.0',
            layers: layers,
            analysis: analysis || []
        };
    }

    function analysisDef(analysis) {
        return JSON.stringify(analysis);
    }

    var DEFAULT_MULTITYPE_STYLE = cartocss();

    var TILE_ANALYSIS_TABLES = { z: 14, x: 8023, y: 6177 };

    var useCases = [
        {
            desc: '1 mapnik layer',
            mapConfig: {
                version: '1.5.0',
                layers: [
                    {
                        type: 'cartodb',
                        options: {
                            sql: "select * from analysis_rent_listings",
                            cartocss: DEFAULT_MULTITYPE_STYLE,
                            cartocss_version: '2.3.0'
                        }
                    }
                ]
            }
        },

        {
            desc: '2 mapnik layers',
            mapConfig: mapConfig([
                {
                    type: 'cartodb',
                    options: {
                        sql: "select * from analysis_banks",
                        cartocss: cartocss('#2167AB'),
                        cartocss_version: '2.3.0'
                    }
                },
                {
                    type: 'cartodb',
                    options: {
                        sql: "select * from analysis_rent_listings",
                        cartocss: DEFAULT_MULTITYPE_STYLE,
                        cartocss_version: '2.3.0'
                    }
                }
            ])
        },

        {
            desc: 'rent listings + buffer over atm-machines',
            mapConfig: mapConfig([
                {
                    type: 'cartodb',
                    options: {
                        sql: "select * from analysis_rent_listings",
                        cartocss: DEFAULT_MULTITYPE_STYLE,
                        cartocss_version: '2.3.0'
                    }
                },
                {
                    type: 'analysis',
                    options: {
                        def: analysisDef({
                            "type": "buffer",
                            "params": {
                                "source": {
                                    "type": "source",
                                    "params": {
                                        "query": "select * from analysis_banks"
                                    }
                                },
                                "radio": 250
                            }
                        }),
                        cartocss: cartocss('black', 0.5)
                    }
                }
            ])
        },

        {
            desc: 'rent listings + point-in-polygon from buffer atm-machines and rent listings',
            mapConfig: mapConfig([
                {
                    type: 'cartodb',
                    options: {
                        sql: "select * from analysis_rent_listings",
                        cartocss: DEFAULT_MULTITYPE_STYLE,
                        cartocss_version: '2.3.0'
                    }
                },
                {
                    type: 'analysis',
                    options: {
                        def: analysisDef({
                            "type": "point-in-polygon",
                            "params": {
                                "pointsSource": {
                                    "type": "source",
                                    "params": {
                                        "query": "select * from analysis_rent_listings"
                                    }
                                },
                                "polygonsSource": {
                                    "type": "buffer",
                                    "params": {
                                        "source": {
                                            "type": "source",
                                            "params": {
                                                "query": "select * from analysis_banks"
                                            }
                                        },
                                        "radio": 250
                                    }
                                }
                            }
                        }),
                        cartocss: cartocss('green', 1.0)
                    }
                }
            ])
        },

        {
            desc: 'point-in-polygon from buffer atm-machines and rent listings + rent listings',
            mapConfig: mapConfig([
                {
                    type: 'analysis',
                    options: {
                        def: analysisDef({
                            "type": "point-in-polygon",
                            "params": {
                                "pointsSource": {
                                    "type": "source",
                                    "params": {
                                        "query": "select * from analysis_rent_listings"
                                    }
                                },
                                "polygonsSource": {
                                    "type": "buffer",
                                    "params": {
                                        "source": {
                                            "type": "source",
                                            "params": {
                                                "query": "select * from analysis_banks"
                                            }
                                        },
                                        "radio": 250
                                    }
                                }
                            }
                        }),
                        cartocss: cartocss('green', 1.0)
                    }
                },
                {
                    type: 'cartodb',
                    options: {
                        sql: "select * from analysis_rent_listings",
                        cartocss: DEFAULT_MULTITYPE_STYLE,
                        cartocss_version: '2.3.0'
                    }
                }
            ])
        },

        {
            desc: 'buffer + point-in-polygon from buffer atm-machines and rent listings + rent listings',
            mapConfig: mapConfig([
                {
                    type: 'cartodb',
                    options: {
                        sql: "select * from analysis_rent_listings",
                        cartocss: DEFAULT_MULTITYPE_STYLE,
                        cartocss_version: '2.3.0'
                    }
                },
                {
                    type: 'analysis',
                    options: {
                        def: analysisDef({
                            "type": "buffer",
                            "params": {
                                "source": {
                                    "type": "source",
                                    "params": {
                                        "query": "select * from analysis_banks"
                                    }
                                },
                                "radio": 300
                            }
                        }),
                        cartocss: cartocss('magenta', 0.5)
                    }
                },
                {
                    type: 'analysis',
                    options: {
                        def: analysisDef({
                            "type": "point-in-polygon",
                            "params": {
                                "pointsSource": {
                                    "type": "source",
                                    "params": {
                                        "query": "select * from analysis_rent_listings"
                                    }
                                },
                                "polygonsSource": {
                                    "type": "buffer",
                                    "params": {
                                        "source": {
                                            "type": "source",
                                            "params": {
                                                "query": "select * from analysis_banks"
                                            }
                                        },
                                        "radio": 300
                                    }
                                }
                            }
                        }),
                        cartocss: cartocss('green', 1.0)
                    }
                }
            ])
        },

        {
            skip: true,
            desc: 'buffer + point-in-polygon from buffer atm-machines and rent listings + rent listings',
            mapConfig: mapConfig([
                {
                    type: 'cartodb',
                    options: {
                        "source": { id: "a" },
                        "cartocss": DEFAULT_MULTITYPE_STYLE,
                        "cartocss_version": "2.3.0"
                    }
                },
                {
                    type: 'cartodb',
                    options: {
                        "source": { id: "b1" },
                        "cartocss": cartocss('green', 1.0),
                        "cartocss_version": "2.3.0"
                    }
                },
                {
                    type: 'cartodb',
                    options: {
                        "source": { id: "b2" },
                        "cartocss": cartocss('magenta', 0.5),
                        "cartocss_version": "2.3.0"
                    }
                }
            ],
            [
                {
                    id: "b2",
                    options: {
                        def: analysisDef({
                            "type": "count-in-polygon",
                            "id": "a0",
                            "params": {
                                "columnName": 'count_airbnb',
                                "pointsSource": {
                                    "type": "source",
                                    "params": {
                                        query: "select * from analysis_rent_listings"
                                    },
                                    dataviews: {
                                        price_histogram: {
                                            type: 'histogram',
                                            options: {
                                                column: 'price'
                                            }
                                        }
                                    }
                                },
                                "polygonsSource": {
                                    "id": "b1",
                                    "type": "buffer",
                                    "params": {
                                        "source": {
                                            "id": "b0",
                                            "type": "source",
                                            "params": {
                                                query: "select * from analysis_banks"
                                            }
                                        },
                                        "radio": 250
                                    },
                                    dataviews: {
                                        bank_category: {
                                            type: 'aggregation',
                                            options: {
                                                column: 'bank'
                                            }
                                        }
                                    }
                                }
                            },
                            dataviews: {
                                count_histogram: {
                                    type: 'histogram',
                                    options: {
                                        column: 'count_airbnb'
                                    }
                                }
                            }
                        }),
                        cartocss: cartocss('green', 1.0)
                    }
                }
            ])
        },

        {
            skip: true,
            desc: 'I. Distribution centers',
            mapConfig: mapConfig(
                [
                    {
                        type: 'cartodb',
                        options: {
                            "source": { id: "b0" },
                            "cartocss": [
                                "#distribution_centers {",
                                "  marker-fill-opacity: 1.0;",
                                "  marker-line-color: #FFF;",
                                "  marker-line-width: 0.5;",
                                "  marker-line-opacity: 0.7;",
                                "  marker-placement: point;",
                                "  marker-type: ellipse;",
                                "  marker-width: 8;",
                                "  marker-fill: blue;",
                                "  marker-allow-overlap: true;",
                                "}"
                            ].join('\n'),
                            "cartocss_version": "2.3.0"
                        }
                    },
                    {
                        type: 'cartodb',
                        options: {
                            "source": { id: "a0" },
                            "cartocss": [
                                "#shops {",
                                "  marker-fill-opacity: 1.0;",
                                "  marker-line-color: #FFF;",
                                "  marker-line-width: 0.5;",
                                "  marker-line-opacity: 0.7;",
                                "  marker-placement: point;",
                                "  marker-type: ellipse;",
                                "  marker-width: 8;",
                                "  marker-fill: red;",
                                "  marker-allow-overlap: true;",
                                "}"
                            ].join('\n'),
                            "cartocss_version": "2.3.0"
                        }
                    },
                    {
                        type: 'cartodb',
                        options: {
                            "source": { id: "a1" },
                            "cartocss": [
                                "#routing {",
                                "  line-color: ramp([routing_time], colorbrewer(Reds));",
                                "  line-width: ramp([routing_time], 2, 8);",
                                "  line-opacity: 1.0;",
                                "}"
                            ].join('\n'),
                            "cartocss_version": "2.3.0"
                        }
                    }
                ],
                [
                    {
                        id: 'a1',
                        type: 'routing-n-to-n',
                        params: {
                            // distanceColumn: 'routing_distance',
                            // timeColumn: 'routing_time',
                            originSource: {
                                id: 'b0',
                                type: 'source',
                                params: {
                                    query: 'select * from distribution_centers'
                                },
                                dataviews: {
                                    distribution_center_name_category: {
                                        type: 'aggregation',
                                        options: {
                                            column: 'name'
                                        }
                                    }
                                }
                            },
                            destinationSource: {
                                id: 'a0',
                                type: 'source',
                                params: {
                                    query: 'select * from shops'
                                }
                            }
                        },
                        dataviews: {
                            time_histogram: {
                                type: 'histogram',
                                options: {
                                    column: 'routing_time'
                                }
                            },
                            distance_histogram: {
                                type: 'histogram',
                                options: {
                                    column: 'routing_distance'
                                }
                            }
                        }
                    }
                ]
            )
        },

        {
            skip: true,
            desc: 'II. Population analysis',
            mapConfig: mapConfig([
                {
                    type: 'cartodb',
                    options: {
                        "source": { id: "a2" },
                        "cartocss": [
                            "#count_in_polygon {",
                            "  polygon-opacity: 1.0",
                            "  line-color: #FFF;",
                            "  line-width: 0.5;",
                            "  line-opacity: 0.7",
                            "  polygon-fill: ramp([estimated_people], colorbrewer(Reds));",
                            "}"
                        ].join('\n'),
                        "cartocss_version": "2.3.0"
                    }
                },
                {
                    type: 'cartodb',
                    options: {
                        "source": { id: "a0" },
                        "cartocss": DEFAULT_MULTITYPE_STYLE,
                        "cartocss_version": "2.3.0"
                    }
                }
            ],
            [
                {
                    id: 'a3',
                    type: 'total-population',
                    params: {
                        source: {
                            id: 'a2',
                            type: 'estimated-population',
                            params: {
                                columnName: 'estimated_people',
                                source: {
                                    id: 'a1',
                                    type: 'trade-area',
                                    params: {
                                        source: {
                                            "id": "a0",
                                            "type": "source",
                                            "params": {
                                                query: "select * from subway_stops"
                                            }
                                        },
                                        kind: 'walk',
                                        time: 300
                                    },
                                    dataviews: {
                                        subway_line_category: {
                                            type: 'aggregation',
                                            options: {
                                                column: 'subway_line'
                                            }
                                        }
                                    }
                                }
                            },
                            dataviews: {
                                people_histogram: {
                                    type: 'histogram',
                                    options: {
                                        column: 'estimated_people'
                                    }
                                }
                            }
                        }
                    },
                    dataviews: {
                        total_population_formula: {
                            type: 'formula',
                            options: {
                                column: 'estimated_people',
                                operation: 'sum'
                            }
                        }
                    }
                }
            ])
        },

        {
            skip: true,
            desc: 'III. Point in polygon',
            mapConfig: mapConfig(
                [
                    {
                        type: 'cartodb',
                        options: {
                            "source": { id: "a1" },
                            "cartocss": [
                                "#count_in_polygon {",
                                "  polygon-opacity: 1.0",
                                "  line-color: #FFF;",
                                "  line-width: 0.5;",
                                "  line-opacity: 0.7",
                                "  polygon-fill: ramp([count_people], colorbrewer(Reds));",
                                "}"
                            ].join('\n'),
                            "cartocss_version": "2.3.0"
                        }
                    }
                ],
                [
                    {
                        "id": "a1",
                        "type": "count-in-polygon",
                        "params": {
                            "columnName": 'count_people',
                            "pointsSource": {
                                "id": 'a0',
                                "type": "source",
                                "params": {
                                    query: "select the_geom, age, gender, income from people"
                                },
                                dataviews: {
                                    age_histogram: {
                                        type: 'histogram',
                                        options: {
                                            column: 'age'
                                        }
                                    },
                                    income_histogram: {
                                        type: 'histogram',
                                        options: {
                                            column: 'income'
                                        }
                                    },
                                    gender_category: {
                                        type: 'aggregation',
                                        options: {
                                            column: 'gender'
                                        }
                                    }
                                }
                            },
                            "polygonsSource": {
                                "id": "b0",
                                "type": "source",
                                "params": {
                                    query: "select * from postal_codes"
                                }
                            }
                        }
                    }
                ]
            )
        }

    ];

    useCases.forEach(function(useCase, imageIdx) {
        if (!!useCase.skip) {
            console.log(JSON.stringify(useCase.mapConfig, null, 4));
        }
        it.skip('should implement use case: "' + useCase.desc + '"', function(done) {

            var testClient = new TestClient(useCase.mapConfig, 1234);

            var tile = useCase.tile || TILE_ANALYSIS_TABLES;

            testClient.getTile(tile.z, tile.x, tile.y, function(err, res, image) {
                assert.ok(!err, err);

                image.save('/tmp/tests/' + imageIdx + '---' + useCase.desc.replace(/\s/g, '-') + '.png');

                assert.equal(image.width(), 256);

                testClient.drain(done);
            });
        });
    });
});
