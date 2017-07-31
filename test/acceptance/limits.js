var testHelper = require('../support/test_helper');

var assert = require('../support/assert');
var _ = require('underscore');
var redis = require('redis');

var CartodbWindshaft = require('../../lib/cartodb/server');
var serverOptions = require('../../lib/cartodb/server_options');

var LayergroupToken = require('../support/layergroup-token');

describe('render limits', function() {

    var layergroupUrl = '/api/v1/map';

    var redisClient = redis.createClient(global.environment.redis.port);

    var server;
    var keysToDelete;
    beforeEach(function() {
        keysToDelete = {};
        server = new CartodbWindshaft(serverOptions);
        server.setMaxListeners(0);
    });

    afterEach(function(done) {
        testHelper.deleteRedisKeys(keysToDelete, done);
    });

    var user = 'localhost';

    var pointSleepSql = "SELECT pg_sleep(0.5)," +
        " 'SRID=3857;POINT(0 0)'::geometry the_geom_webmercator, 1 cartodb_id";
    var pointCartoCss = '#layer { marker-fill:red; }';
    var polygonSleepSql = "SELECT pg_sleep(0.5)," +
        " ST_Buffer('SRID=3857;POINT(0 0)'::geometry, 100000000) the_geom_webmercator, 1 cartodb_id";
    var polygonCartoCss = '#layer { polygon-fill:red; }';

    function singleLayergroupConfig(sql, cartocss) {
        return {
            version: '1.0.0',
            layers: [
                {
                    type: 'mapnik',
                    options: {
                        sql: sql,
                        cartocss: cartocss,
                        cartocss_version: '2.0.1'
                    }
                }
            ]
        };
    }

    function createRequest(layergroup, userHost) {
        return {
            url: layergroupUrl,
            method: 'POST',
            headers: {
                host: userHost,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify(layergroup)
        };
    }

    function withRenderLimit(user, renderLimit, callback) {
        redisClient.SELECT(5, function(err) {
            if (err) {
                return callback(err);
            }
            var userLimitsKey = 'limits:tiler:' + user;
            redisClient.HSET(userLimitsKey, 'render', renderLimit, function(err) {
                if (err) {
                    return callback(err);
                }
                keysToDelete[userLimitsKey] = 5;
                return callback();
            });
        });

    }

    describe('with onTileErrorStrategy DISABLED', function() {
        var onTileErrorStrategyEnabled;
        before(function() {
            onTileErrorStrategyEnabled = global.environment.enabledFeatures.onTileErrorStrategy;
            global.environment.enabledFeatures.onTileErrorStrategy = false;
        });

        after(function() {
            global.environment.enabledFeatures.onTileErrorStrategy = onTileErrorStrategyEnabled;
        });

        it("layergroup creation fails if test tile is slow", function(done) {
            withRenderLimit(user, 50, function(err) {
                if (err) {
                    return done(err);
                }

                var layergroup = singleLayergroupConfig(polygonSleepSql, polygonCartoCss);
                assert.response(server,
                    createRequest(layergroup, user),
                    {
                        status: 429
                    },
                    function(res) {
                        var parsed = JSON.parse(res.body);
                        assert.deepEqual(parsed.errors, [
                            'You are over platform limits. Please contact us to know more details'
                        ]);
                        done();
                    }
                );
            });
        });

        it("layergroup creation does not fail if user limit is high enough even if test tile is slow", function(done) {
            withRenderLimit(user, 5000, function(err) {
                if (err) {
                    return done(err);
                }

                var layergroup = singleLayergroupConfig(polygonSleepSql, polygonCartoCss);
                assert.response(server,
                    createRequest(layergroup, user),
                    {
                        status: 200
                    },
                    function(res) {
                        var parsed = JSON.parse(res.body);
                        assert.ok(parsed.layergroupid);
                        keysToDelete['map_cfg|' + LayergroupToken.parse(parsed.layergroupid).token] = 0;
                        keysToDelete['user:localhost:mapviews:global'] = 5;
                        done();
                    }
                );
            });
        });


        it("layergroup creation works if test tile is fast but tile request fails if they are slow",  function(done) {
            withRenderLimit(user, 50, function(err) {
                if (err) {
                    return done(err);
                }

                var layergroup = singleLayergroupConfig(pointSleepSql, pointCartoCss);
                assert.response(server,
                    createRequest(layergroup, user),
                    {
                        status: 200
                    },
                    function(res) {
                        keysToDelete['map_cfg|' + LayergroupToken.parse(JSON.parse(res.body).layergroupid).token] = 0;
                        keysToDelete['user:localhost:mapviews:global'] = 5;
                        assert.response(server,
                            {
                                url: layergroupUrl + _.template('/<%= layergroupId %>/<%= z %>/<%= x %>/<%= y %>.png', {
                                    layergroupId: JSON.parse(res.body).layergroupid,
                                    z: 0,
                                    x: 0,
                                    y: 0
                                }),
                                method: 'GET',
                                headers: {
                                    host: 'localhost'
                                },
                                encoding: 'binary'
                            },
                            {
                                status: 429
                            },
                            function(res) {
                                var parsed = JSON.parse(res.body);
                                assert.deepEqual(parsed.errors, [
                                    'You are over platform limits. Please contact us to know more details'
                                ]);
                                done();
                            }
                        );

                    }
                );
            });
        });

        it("tile request does not fail if user limit is high enough",  function(done) {
            withRenderLimit(user, 5000, function(err) {
                if (err) {
                    return done(err);
                }

                var layergroup = singleLayergroupConfig(pointSleepSql, pointCartoCss);
                assert.response(server,
                    createRequest(layergroup, user),
                    {
                        status: 200
                    },
                    function(res) {
                        keysToDelete['map_cfg|' + LayergroupToken.parse(JSON.parse(res.body).layergroupid).token] = 0;
                        keysToDelete['user:localhost:mapviews:global'] = 5;
                        assert.response(server,
                            {
                                url: layergroupUrl + _.template('/<%= layergroupId %>/<%= z %>/<%= x %>/<%= y %>.png', {
                                    layergroupId: JSON.parse(res.body).layergroupid,
                                    z: 0,
                                    x: 0,
                                    y: 0
                                }),
                                method: 'GET',
                                headers: {
                                    host: 'localhost'
                                },
                                encoding: 'binary'
                            },
                            {
                                status: 200,
                                headers: {
                                    'Content-Type': 'image/png'
                                }
                            },
                            function(res, err) {
                                done(err);
                            }
                        );

                    }
                );
            });
        });

    });

    describe('with onTileErrorStrategy', function() {

        it("layergroup creation works even if test tile is slow", function(done) {
            withRenderLimit(user, 50, function(err) {
                if (err) {
                    return done(err);
                }

                var layergroup = singleLayergroupConfig(polygonSleepSql, polygonCartoCss);
                assert.response(server,
                    createRequest(layergroup, user),
                    {
                        status: 200
                    },
                    function(res) {
                        var parsed = JSON.parse(res.body);
                        assert.ok(parsed.layergroupid);
                        keysToDelete['map_cfg|' + LayergroupToken.parse(parsed.layergroupid).token] = 0;
                        keysToDelete['user:localhost:mapviews:global'] = 5;
                        done();
                    }
                );
            });
        });

        it("layergroup creation and tile requests works even if they are slow but returns fallback",  function(done) {
            withRenderLimit(user, 50, function(err) {
                if (err) {
                    return done(err);
                }

                var layergroup = singleLayergroupConfig(pointSleepSql, pointCartoCss);
                assert.response(server,
                    createRequest(layergroup, user),
                    {
                        status: 200
                    },
                    function(res) {
                        keysToDelete['map_cfg|' + LayergroupToken.parse(JSON.parse(res.body).layergroupid).token] = 0;
                        keysToDelete['user:localhost:mapviews:global'] = 5;
                        assert.response(server,
                            {
                                url: layergroupUrl + _.template('/<%= layergroupId %>/<%= z %>/<%= x %>/<%= y %>.png', {
                                    layergroupId: JSON.parse(res.body).layergroupid,
                                    z: 0,
                                    x: 0,
                                    y: 0
                                }),
                                method: 'GET',
                                headers: {
                                    host: 'localhost'
                                },
                                encoding: 'binary'
                            },
                            {
                                status: 200,
                                headers: {
                                    'Content-Type': 'image/png'
                                }
                            },
                            function(res, err) {
                                if (err) {
                                    done(err);
                                }
                                var referenceImagePath = './test/fixtures/render-timeout-fallback.png';
                                assert.imageBufferIsSimilarToFile(res.body, referenceImagePath, 25,
                                    function(imgErr/*, similarity*/) {
                                        done(imgErr);
                                    }
                                );
                            }
                        );

                    }
                );
            });
        });

    });

});
