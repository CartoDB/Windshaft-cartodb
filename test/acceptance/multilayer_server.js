var testHelper = require('../support/test_helper');

var assert = require('../support/assert');

var redis = require('redis');
var _ = require('underscore');


var PgQueryRunner = require('../../lib/cartodb/backends/pg_query_runner');
var CartodbWindshaft = require('../../lib/cartodb/cartodb_windshaft');
var serverOptions = require('../../lib/cartodb/server_options')();
var server = new CartodbWindshaft(serverOptions);
server.setMaxListeners(0);

describe('tests from old api translated to multilayer', function() {

    var layergroupUrl = '/api/v1/map';

    var redisClient = redis.createClient(global.environment.redis.port);
    after(function(done) {
        // This test will add map_style records, like
        // 'map_style|null|publicuser|my_table',
        redisClient.keys("map_style|*", function(err, matches) {
            redisClient.del(matches, function() {
                done();
            });
        });
    });

    var wadusSql = 'select 1 as cartodb_id, null::geometry as the_geom_webmercator';
    var pointSql = "SELECT 'SRID=3857;POINT(0 0)'::geometry as the_geom_webmercator, 1::int as cartodb_id";

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

    function createRequest(layergroup, userHost, apiKey) {
        var url = layergroupUrl;
        if (apiKey) {
            url += '?api_key=' + apiKey;
        }
        return {
            url: url,
            method: 'POST',
            headers: {
                host: userHost || 'localhost',
                'Content-Type': 'application/json'
            },
            data: JSON.stringify(layergroup)
        };
    }

    it("layergroup creation fails if CartoCSS is bogus", function(done) {
        var layergroup = singleLayergroupConfig(wadusSql, '#my_table3{');
        assert.response(server,
            createRequest(layergroup),
            {
                status: 400
            },
            function(res) {
                var parsed = JSON.parse(res.body);
                assert.ok(parsed.errors[0].match(/^style0/));
                assert.ok(parsed.errors[0].match(/missing closing/));
                done();
            }
        );
    });

    it("multiple bad styles returns 400 with all errors", function(done) {
        var layergroup = singleLayergroupConfig(wadusSql, '#my_table4{backgxxxxxround-color:#fff;foo:bar}');
        assert.response(server,
            createRequest(layergroup),
            {
                status: 400
            },
            function(res) {
                var parsed = JSON.parse(res.body);
                assert.equal(parsed.errors.length, 1);
                assert.ok(parsed.errors[0].match(/^style0/));
                assert.ok(parsed.errors[0].match(/Unrecognized rule: backgxxxxxround-color/));
                assert.ok(parsed.errors[0].match(/Unrecognized rule: foo/));
                done();
            }
        );
    });

    // Zoom is a special variable
    it("Specifying zoom level in CartoCSS does not need a 'zoom' variable in SQL output", function(done) {
        var layergroup = singleLayergroupConfig(pointSql, '#gadm4 [ zoom>=3] { marker-fill:red; }');

        assert.response(server,
            createRequest(layergroup),
            {
                status: 200
            },
            function(res) {
                var parsed = JSON.parse(res.body);
                assert.ok(parsed.layergroupid);
                done();
            }
        );
    });

    // See https://github.com/CartoDB/Windshaft-cartodb/issues/88
    it("getting a tile from a user-specific database should return an expected tile", function(done) {
        var layergroup = singleLayergroupConfig(pointSql, '#layer { marker-fill:red; }');

        var backupDBHost = global.environment.postgres.host;
        global.environment.postgres.host = '6.6.6.6';

        assert.response(server,
            createRequest(layergroup, 'cartodb250user'),
            {
                status: 200
            },
            function(res) {
                var parsed = JSON.parse(res.body);
                assert.ok(parsed.layergroupid);

                global.environment.postgres.host = backupDBHost;
                done();
            }
        );
    });

    // See https://github.com/CartoDB/Windshaft-cartodb/issues/89
    it("getting a tile with a user-specific database password", function(done) {
        var layergroup = singleLayergroupConfig(pointSql, '#layer { marker-fill:red; }');

        var backupDBPass = global.environment.postgres_auth_pass;
        global.environment.postgres_auth_pass = '<%= user_password %>';

        assert.response(server,
            createRequest(layergroup, 'cartodb250user', '4321'),
            {
                status: 200
            },
            function(res) {
                var parsed = JSON.parse(res.body);
                assert.ok(parsed.layergroupid);

                global.environment.postgres_auth_pass = backupDBPass;
                done();
            }
        );
    });

    it("creating a layergroup from lzma param",  function(done){
        var params = {
            config: JSON.stringify(singleLayergroupConfig(pointSql, '#layer { marker-fill:red; }'))
        };

        testHelper.lzma_compress_to_base64(JSON.stringify(params), 1, function(err, lzma) {
            if (err) {
                return done(err);
            }
            assert.response(server,
                {
                    url: layergroupUrl + '?lzma=' + encodeURIComponent(lzma),
                    method: 'GET',
                    headers: {
                        host: 'localhost'
                    },
                    encoding: 'binary'
                },
                {
                    status: 200
                },
                function(res) {
                    var parsed = JSON.parse(res.body);
                    assert.ok(parsed.layergroupid);

                    done();
                }
            );
        });
    });

    it("creating a layergroup from lzma param, invalid json input",  function(done) {
        var params = {
            config: 'WADUS'
        };

        testHelper.lzma_compress_to_base64(JSON.stringify(params), 1, function(err, lzma) {
            if (err) {
                return done(err);
            }
            assert.response(server,
                {
                    url: layergroupUrl + '?lzma=' + encodeURIComponent(lzma),
                    method: 'GET',
                    headers: {
                        host: 'localhost'
                    },
                    encoding: 'binary'
                },
                {
                    status: 400
                },
                function(res) {
                    var parsed = JSON.parse(res.body);
                    assert.deepEqual(parsed, { errors: [ 'Unexpected token W' ] });

                    done();
                }
            );
        });
    });

    it("uses queries postgresql to figure affected tables in query",  function(done) {
        var tableName = 'gadm4';
        var expectedCacheChannel = _.template('<%= databaseName %>:public.<%= tableName %>', {
            databaseName: _.template(global.environment.postgres_auth_user, {user_id:1}) + '_db',
            tableName: tableName
        });

        var layergroup =  singleLayergroupConfig('select * from ' + tableName, '#gadm4 { marker-fill: red; }');

        assert.response(server,
            {
                url: layergroupUrl + '?config=' + encodeURIComponent(JSON.stringify(layergroup)),
                method: 'GET',
                headers: {
                    host: 'localhost'
                }
            },
            {
                status: 200
            },
            function(res) {
                var parsed = JSON.parse(res.body);
                assert.ok(parsed.layergroupid);

                assert.ok(res.headers.hasOwnProperty('x-cache-channel'));
                assert.equal(res.headers['x-cache-channel'], expectedCacheChannel);

                done();
            }
        );
    });

    it("creates layergroup fails when postgresql queries fail to figure affected tables in query",  function(done) {

        var runQueryFn = PgQueryRunner.prototype.run;
        PgQueryRunner.prototype.run = function(username, query, queryHandler, callback) {
            return queryHandler(new Error('fake error message'), [], callback);
        };

        var layergroup =  singleLayergroupConfig('select * from gadm4', '#gadm4 { marker-fill: red; }');

        assert.response(server,
            {
                url: layergroupUrl + '?config=' + encodeURIComponent(JSON.stringify(layergroup)),
                method: 'GET',
                headers: {
                    host: 'localhost'
                }
            },
            {
                status: 400
            },
            function(res) {
                PgQueryRunner.prototype.run = runQueryFn;

                assert.ok(!res.headers.hasOwnProperty('x-cache-channel'));

                var parsed = JSON.parse(res.body);
                assert.deepEqual(parsed, {
                    errors: ["Error: could not fetch affected tables and last updated time: fake error message"]
                });

                done();
            }
        );
    });

    it("tile requests works when postgresql queries fail to figure affected tables in query",  function(done) {
        var layergroup =  singleLayergroupConfig('select * from gadm4', '#gadm4 { marker-fill: red; }');
        assert.response(server,
            {
                url: layergroupUrl + '?config=' + encodeURIComponent(JSON.stringify(layergroup)),
                method: 'GET',
                headers: {
                    host: 'localhost'
                }
            },
            {
                status: 200
            },
            function(res) {
                var runQueryFn = PgQueryRunner.prototype.run;
                PgQueryRunner.prototype.run = function(username, query, queryHandler, callback) {
                    return queryHandler(new Error('failed to query database for affected tables'), [], callback);
                };

                // reset internal cacheChannel cache
                serverOptions.channelCache = {};

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
                        status: 200
                    },
                    function(res) {
                        assert.ok(!res.headers.hasOwnProperty('x-cache-channel'));
                        PgQueryRunner.prototype.run = runQueryFn;
                        done();
                    }
                );
            }
        );
    });

});
