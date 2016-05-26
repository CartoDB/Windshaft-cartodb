//require('../../../support/test_helper');
var assert = require('assert');

var DataviewsMapConfigAdapter = require('../../../../lib/cartodb/models/mapconfig/adapter/dataviews-widgets-adapter');

describe('dataviews-widgets-adapter', function() {

    var widgetsMapConfigs = [
        {
            "input": {
                "version": "1.4.0",
                "layers": [
                    {
                        "type": "mapnik",
                        "options": {
                            "sql": "select * from populated_places_simple_reduced",
                            "cartocss": "#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }",
                            "cartocss_version": "2.3.0",
                            "widgets": {
                                "country_places_count": {
                                    "type": "aggregation",
                                    "options": {
                                        "column": "adm0_a3",
                                        "aggregation": "count"
                                    }
                                }
                            }
                        }
                    }
                ]
            },
            "expected": {
                "version": "1.4.0",
                "layers": [
                    {
                        "type": "mapnik",
                        "options": {
                            "source": {
                                "id": "cdb-layer-source-0"
                            },
                            "cartocss": "#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }",
                            "cartocss_version": "2.3.0",
                            // keep them for now
                            "widgets": {
                                "country_places_count": {
                                    "type": "aggregation",
                                    "options": {
                                        "column": "adm0_a3",
                                        "aggregation": "count"
                                    }
                                }
                            }
                        }
                    }
                ],
                "analyses": [
                    {
                        "id": "cdb-layer-source-0",
                        "type": "source",
                        "params": {
                            "query": "select * from populated_places_simple_reduced"
                        }
                    }
                ],
                "dataviews": {
                    "country_places_count": {
                        "source": {
                            "id": "cdb-layer-source-0"
                        },
                        "type": "aggregation",
                        "options": {
                            "column": "adm0_a3",
                            "aggregation": "count"
                        }
                    }
                }
            }
        },
        {
            "input": {
                "version": "1.4.0",
                "layers": [
                    {
                        "type": "mapnik",
                        "options": {
                            "sql": "select * from populated_places_simple_reduced",
                            "cartocss": "#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }",
                            "cartocss_version": "2.3.0",
                            "widgets": {
                                "pop_max": {
                                    "type": "histogram",
                                    "options": {
                                        "column": "pop_max"
                                    }
                                }
                            }
                        }
                    }
                ]
            },
            "expected": {
                "version": "1.4.0",
                "layers": [
                    {
                        "type": "mapnik",
                        "options": {
                            "source": {
                                "id": "cdb-layer-source-0"
                            },
                            "cartocss": "#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }",
                            "cartocss_version": "2.3.0",
                            // keep them for now
                            "widgets": {
                                "pop_max": {
                                    "type": "histogram",
                                    "options": {
                                        "column": "pop_max"
                                    }
                                }
                            }
                        }
                    }
                ],
                "analyses": [
                    {
                        "id": "cdb-layer-source-0",
                        "type": "source",
                        "params": {
                            "query": "select * from populated_places_simple_reduced"
                        }
                    }
                ],
                "dataviews": {
                    "pop_max": {
                        "source": {
                            "id": "cdb-layer-source-0"
                        },
                        "type": "histogram",
                        "options": {
                            "column": "pop_max"
                        }
                    }
                }
            }
        },
        {
            "input": {
                "version": "1.4.0",
                "layers": [
                    {
                        "type": "mapnik",
                        "options": {
                            "sql": "select * from test_table",
                            "cartocss": "#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }",
                            "cartocss_version": "2.3.0",
                            "widgets": {
                                "names": {
                                    "type": "list",
                                    "options": {
                                        "columns": [
                                            "name"
                                        ]
                                    }
                                }
                            }
                        }
                    }
                ]
            },
            "expected": {
                "version": "1.4.0",
                "layers": [
                    {
                        "type": "mapnik",
                        "options": {
                            "source": {
                                "id": "cdb-layer-source-0"
                            },
                            "cartocss": "#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }",
                            "cartocss_version": "2.3.0",
                            // keep them for now
                            "widgets": {
                                "names": {
                                    "type": "list",
                                    "options": {
                                        "columns": [
                                            "name"
                                        ]
                                    }
                                }
                            }
                        }
                    }
                ],
                "analyses": [
                    {
                        "id": "cdb-layer-source-0",
                        "type": "source",
                        "params": {
                            "query": "select * from test_table"
                        }
                    }
                ],
                "dataviews": {
                    "names": {
                        "source": {
                            "id": "cdb-layer-source-0"
                        },
                        "type": "list",
                        "options": {
                            "columns": [
                                "name"
                            ]
                        }
                    }
                }
            }
        },
        {
            "input": {
                "version": "1.4.0",
                "layers": [
                    {
                        "type": "mapnik",
                        "options": {
                            "sql": "select * from populated_places_simple_reduced",
                            "cartocss": "#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }",
                            "cartocss_version": "2.3.0",
                            "widgets": {
                                "country_places_count": {
                                    "type": "aggregation",
                                    "options": {
                                        "column": "adm0_a3",
                                        "aggregation": "count"
                                    }
                                },
                                "country_places_histogram": {
                                    "type": "histogram",
                                    "options": {
                                        "column": "pop_max"
                                    }
                                }
                            }
                        }
                    }
                ]
            },
            "expected": {
                "version": "1.4.0",
                "layers": [
                    {
                        "type": "mapnik",
                        "options": {
                            "source": {
                                "id": "cdb-layer-source-0"
                            },
                            "cartocss": "#layer { marker-fill: red; marker-width: 32; marker-allow-overlap: true; }",
                            "cartocss_version": "2.3.0",
                            // keep them for now
                            "widgets": {
                                "country_places_count": {
                                    "type": "aggregation",
                                    "options": {
                                        "column": "adm0_a3",
                                        "aggregation": "count"
                                    }
                                },
                                "country_places_histogram": {
                                    "type": "histogram",
                                    "options": {
                                        "column": "pop_max"
                                    }
                                }
                            }
                        }
                    }
                ],
                "analyses": [
                    {
                        "id": "cdb-layer-source-0",
                        "type": "source",
                        "params": {
                            "query": "select * from populated_places_simple_reduced"
                        }
                    }
                ],
                "dataviews": {
                    "country_places_count": {
                        "source": {
                            "id": "cdb-layer-source-0"
                        },
                        "type": "aggregation",
                        "options": {
                            "column": "adm0_a3",
                            "aggregation": "count"
                        }
                    },
                    "country_places_histogram": {
                        "source": {
                            "id": "cdb-layer-source-0"
                        },
                        "type": "histogram",
                        "options": {
                            "column": "pop_max"
                        }
                    }
                }
            }
        }
    ];

    var user = 'wadus';
    function params() {
        return {};
    }
    function context() {
        return {};
    }

    var dataviewsMapConfigAdapter = new DataviewsMapConfigAdapter();

    widgetsMapConfigs.forEach(function(mapConfig, index) {
        it('should adapt widgets ' + index, function(done) {
            dataviewsMapConfigAdapter.getMapConfig(user, mapConfig.input, params(), context(), function(err, result) {
                assert.deepEqual(result, mapConfig.expected);
                done();
            });
        });
    });

});
