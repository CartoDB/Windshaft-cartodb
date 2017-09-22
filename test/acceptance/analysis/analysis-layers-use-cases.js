require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');
var dot = require('dot');
var debug = require('debug')('windshaft:cartodb:test');

describe('analysis-layers use cases', function () {


    var multitypeStyleTemplate = dot.template(
        `#points['mapnik::geometry_type'=1] {
          marker-fill-opacity: {{=it._opacity}};
          marker-line-color: #FFF;
          marker-line-width: 0.5;
          marker-line-opacity: {{=it._opacity}};
          marker-placement: point;
          marker-type: ellipse;
          marker-width: 8;
          marker-fill: {{=it._color}};
          marker-allow-overlap: true;
        }
        #lines['mapnik::geometry_type'=2] {
          line-color: {{=it._color}};
          line-width: 2;
          line-opacity: {{=it._opacity}};
        }
        #polygons['mapnik::geometry_type'=3] {
          polygon-fill: {{=it._color}};
          polygon-opacity: {{=it._opacity}};
          line-color: #FFF;
          line-width: 0.5;
          line-opacity: {{=it._opacity}};
        }`
    );


    function cartocss(color, opacity) {
        return multitypeStyleTemplate({
            _color: color || '#F11810',
            _opacity: Number.isFinite(opacity) ? opacity : 1
        });
    }

    function mapConfig(layers, dataviews, analysis) {
        return {
            version: '1.5.0',
            layers: layers,
            dataviews: dataviews || {},
            analyses: analysis || []
        };
    }

    var DEFAULT_MULTITYPE_STYLE = cartocss();

    var TILE_ANALYSIS_TABLES = { z: 14, x: 8023, y: 6177 };

    var pointInPolygonDef = {
        id: 'a1',
        type: 'point-in-polygon',
        params: {
            points_source: {
                type: 'source',
                params: {
                    query: 'select * from analysis_rent_listings'
                }
            },
            polygons_source: {
                type: 'buffer',
                params: {
                    source: {
                        type: 'source',
                        params: {
                            query: 'select * from analysis_banks'
                        }
                    },
                    radius: 250
                }
            }
        }
    };

    var bufferDef = {
        id: 'b1',
        type: 'buffer',
        params: {
            source: {
                type: 'source',
                params: {
                    query: 'select * from analysis_banks'
                }
            },
            radius: 250
        }
    };

    var useCases = [
        {
            desc: '1 mapnik layer',
            mapConfig: {
                version: '1.5.0',
                layers: [
                    {
                        type: 'cartodb',
                        options: {
                            sql: 'select * from analysis_rent_listings',
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
                        sql: 'select * from analysis_banks',
                        cartocss: cartocss('#2167AB'),
                        cartocss_version: '2.3.0'
                    }
                },
                {
                    type: 'cartodb',
                    options: {
                        sql: 'select * from analysis_rent_listings',
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
                        sql: 'select * from analysis_rent_listings',
                        cartocss: DEFAULT_MULTITYPE_STYLE,
                        cartocss_version: '2.3.0'
                    }
                },
                {
                    type: 'cartodb',
                    options: {
                        source: {
                            id: 'b1'
                        },
                        cartocss: DEFAULT_MULTITYPE_STYLE,
                        cartocss_version: '2.3.0'
                    }
                }
            ],
                {},
                [
                    bufferDef
                ]
            )
        },

        {
            desc: 'rent listings + point-in-polygon from buffer atm-machines and rent listings',
            mapConfig: mapConfig([
                {
                    type: 'cartodb',
                    options: {
                        sql: 'select * from analysis_rent_listings',
                        cartocss: DEFAULT_MULTITYPE_STYLE,
                        cartocss_version: '2.3.0'
                    }
                },
                {
                    type: 'cartodb',
                    options: {
                        source: {
                            id: 'a1'
                        },
                        cartocss: DEFAULT_MULTITYPE_STYLE,
                        cartocss_version: '2.3.0'
                    }
                }
            ],
                {},
                [
                    pointInPolygonDef
                ]
            )
        },

        {
            desc: 'point-in-polygon from buffer atm-machines and rent listings + rent listings',
            mapConfig: mapConfig(
                [
                    {
                        type: 'cartodb',
                        options: {
                            source: {
                                id: 'a1'
                            },
                            cartocss: DEFAULT_MULTITYPE_STYLE,
                            cartocss_version: '2.3.0'
                        }
                    },
                    {
                        type: 'cartodb',
                        options: {
                            sql: 'select * from analysis_rent_listings',
                            cartocss: DEFAULT_MULTITYPE_STYLE,
                            cartocss_version: '2.3.0'
                        }
                    }
                ],
                {},
                [
                    pointInPolygonDef
                ]
            )
        },

        {
            desc: 'buffer + point-in-polygon from buffer atm-machines and rent listings + rent listings',
            mapConfig: mapConfig(
                [
                    {
                        type: 'cartodb',
                        options: {
                            sql: 'select * from analysis_rent_listings',
                            cartocss: DEFAULT_MULTITYPE_STYLE,
                            cartocss_version: '2.3.0'
                        }
                    },
                    {
                        type: 'cartodb',
                        options: {
                            source: {
                                id: 'a1'
                            },
                            cartocss: DEFAULT_MULTITYPE_STYLE,
                            cartocss_version: '2.3.0'
                        }
                    },
                    {
                        type: 'cartodb',
                        options: {
                            source: {
                                id: 'b1'
                            },
                            cartocss: DEFAULT_MULTITYPE_STYLE,
                            cartocss_version: '2.3.0'
                        }
                    }
                ],
                {},
                [
                    bufferDef,
                    pointInPolygonDef
                ]
            )
        }
    ];

    useCases.forEach(function (useCase) {
        if (!!useCase.skip) {
            return debug(JSON.stringify(useCase.mapConfig, null, 4));
        }
        it(`should implement use case: '${useCase.desc}'`, function (done) {

            var testClient = new TestClient(useCase.mapConfig, 1234);

            var tile = useCase.tile || TILE_ANALYSIS_TABLES;

            testClient.getTile(tile.z, tile.x, tile.y, function (err, res, image) {
                assert.ok(!err, err);

                //image.save('/tmp/tests/' + imageIdx + '---' + useCase.desc.replace(/\s/g, '-') + '.png');

                assert.equal(image.width(), 256);

                testClient.drain(done);
            });
        });
    });
});
