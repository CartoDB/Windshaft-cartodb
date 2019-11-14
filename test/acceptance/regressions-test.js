'use strict';

require('../support/test-helper');
var assert = require('../support/assert');
const helper = require('../support/test-helper');
var TestClient = require('../support/test-client');
const LayergroupToken = require('../../lib/models/layergroup-token');
const CartodbWindshaft = require('../../lib/server');
const serverOptions = require('../../lib/server-options');

describe('regressions', function () {
    var ERROR_RESPONSE = {
        status: 400,
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    };

    it('should expose a nice error when missing sql option', function (done) {
        var mapConfig = {
            version: '1.5.0',
            layers: [
                {
                    type: 'cartodb',
                    options: {
                        cartocss: '#polygons { polygon-fill: red; }',
                        cartocss_version: '2.3.0'
                    }
                }
            ]
        };

        var testClient = new TestClient(mapConfig, 1234);

        testClient.getLayergroup({ response: ERROR_RESPONSE }, function (err, layergroupResult) {
            assert.ok(!err, err);

            assert.strictEqual(layergroupResult.errors.length, 1);
            assert.strictEqual(layergroupResult.errors[0], 'Missing sql for layer 0 options');

            testClient.drain(done);
        });
    });

    // See: https://github.com/CartoDB/Windshaft-cartodb/pull/956
    it('"/user/localhost/api/v1/map" should create an anonymous map', function (done) {
        const server = new CartodbWindshaft(serverOptions);
        const layergroup = {
            version: '1.7.0',
            layers: [
                {
                    type: 'mapnik',
                    options: {
                        sql: TestClient.SQL.ONE_POINT,
                        cartocss: TestClient.CARTOCSS.POINTS,
                        cartocss_version: '2.3.0'
                    }
                }
            ]
        };

        const keysToDelete = {};

        assert.response(server,
            {
                url: '/user/localhost/api/v1/map',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(layergroup)
            },
            function (res, err) {
                if (err) {
                    return done(err);
                }

                const body = JSON.parse(res.body);
                assert.ok(body.layergroupid);

                keysToDelete['map_cfg|' + LayergroupToken.parse(body.layergroupid).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;
                helper.deleteRedisKeys(keysToDelete, done);
            }
        );
    });

    describe('map instantiation', function () {
        const apikeyToken = 'regular1';
        const mapConfig = {
            version: '1.7.0',
            layers: [{
                type: 'cartodb',
                options: {
                    sql: 'select * from test_table_localhost_regular1',
                    cartocss: TestClient.CARTOCSS.POINTS,
                    cartocss_version: '2.3.0'
                }
            }]
        };

        it('should have distint timestamps when the source was updated', function (done) {
            const testClient = new TestClient(mapConfig, apikeyToken);

            testClient.getLayergroup({}, (err, layergroup) => {
                if (err) {
                    return done(err);
                }

                const { cacheBuster: cacheBusterA } = LayergroupToken.parse(layergroup.layergroupid);

                const conn = testClient.getDBConnection();

                const sql = 'select CDB_TableMetadataTouch(\'test_table_localhost_regular1\'::regclass)';

                conn.query(sql, (err) => {
                    if (err) {
                        return done(err);
                    }

                    testClient.getLayergroup({}, (err, layergroup) => {
                        if (err) {
                            return done(err);
                        }

                        const { cacheBuster: cacheBusterB } = LayergroupToken.parse(layergroup.layergroupid);

                        const timestampA = parseInt(cacheBusterA, 10);
                        const timestampB = parseInt(cacheBusterB, 10);

                        assert.notStrictEqual(timestampA, timestampB);
                        assert.ok(timestampA < timestampB, `timestampA: ${timestampA} > timestampB:${timestampB}`);

                        testClient.drain(done);
                    });
                });
            });
        });
    });

    it('should create and instantiate a named map with filters', function (done) {
        const apikeyToken = '1234';

        const template = {
            version: '0.0.1',
            name: 'regression-dataview-filter-template',
            placeholders: {
                buffersize: {
                    type: 'number',
                    default: 0
                }
            },
            layergroup: {
                version: '1.6.0',
                layers: [
                    {
                        type: 'cartodb',
                        options: {
                            source: {
                                id: 'a1'
                            },
                            cartocss: TestClient.CARTOCSS.POINTS,
                            cartocss_version: '2.3.0'
                        }
                    }
                ],
                dataviews: {
                    country_places_count: {
                        source: {
                            id: 'a1'
                        },
                        type: 'aggregation',
                        options: {
                            column: 'adm0_a3',
                            aggregation: 'count'
                        }
                    }
                },
                analyses: [
                    {
                        id: 'a1',
                        type: 'source',
                        params: {
                            query: 'select * from populated_places_simple_reduced'
                        }
                    }
                ]
            }
        };

        const testClient = new TestClient(template, apikeyToken);
        testClient.keysToDelete['map_tpl|localhost'] = 0;

        const params = {
            own_filter: 1,
            filters: {
                dataviews: {
                    country_places_count: {
                        accept: ['CAN']
                    }
                }
            }
        };

        testClient.getDataview('country_places_count', params, (err, dataview) => {
            assert.ifError(err);

            assert.strictEqual(dataview.type, 'aggregation');
            assert.strictEqual(dataview.categories.length, 1);
            assert.deepStrictEqual(dataview.categories[0], { value: 256, category: 'CAN', agg: false });

            testClient.drain(done);
        });
    });
});
