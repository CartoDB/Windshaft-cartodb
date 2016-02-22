var testHelper = require('../support/test_helper');

var assert = require('../support/assert');

var _ = require('underscore');

var LayergroupToken = require('../../lib/cartodb/models/layergroup_token');

var PgQueryRunner = require('../../lib/cartodb/backends/pg_query_runner');
var QueryTables = require('cartodb-query-tables');
var CartodbWindshaft = require('../../lib/cartodb/server');
var serverOptions = require('../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);
server.setMaxListeners(0);

describe('tests from old api translated to multilayer', function() {

    var layergroupUrl = '/api/v1/map';

    var keysToDelete;

    beforeEach(function() {
        keysToDelete = {};
    });

    afterEach(function(done) {
        testHelper.deleteRedisKeys(keysToDelete, done);
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
                assert.equal(res.headers['x-layergroup-id'], parsed.layergroupid);

                keysToDelete['map_cfg|' + LayergroupToken.parse(parsed.layergroupid).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;

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
                assert.equal(res.headers['x-layergroup-id'], parsed.layergroupid);


                keysToDelete['map_cfg|' + LayergroupToken.parse(parsed.layergroupid).token] = 0;
                keysToDelete['user:cartodb250user:mapviews:global'] = 5;

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
                assert.equal(res.headers['x-layergroup-id'], parsed.layergroupid);

                keysToDelete['map_cfg|' + LayergroupToken.parse(parsed.layergroupid).token] = 0;
                keysToDelete['user:cartodb250user:mapviews:global'] = 5;

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

                    keysToDelete['map_cfg|' + LayergroupToken.parse(parsed.layergroupid).token] = 0;
                    keysToDelete['user:localhost:mapviews:global'] = 5;

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

                assert.equal(res.headers['x-layergroup-id'], parsed.layergroupid);

                keysToDelete['map_cfg|' + LayergroupToken.parse(parsed.layergroupid).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;

                done();
            }
        );
    });

    // https://github.com/CartoDB/cartodb-postgresql/issues/86
    it.skip("should not fail with long table names because table name length limit",  function(done) {
        var tableName = 'long_table_name_with_enough_chars_to_break_querytables_function';
        var expectedCacheChannel = _.template('<%= databaseName %>:public.<%= tableName %>', {
            databaseName: _.template(global.environment.postgres_auth_user, {user_id:1}) + '_db',
            tableName: tableName
        });

        var layergroup =  singleLayergroupConfig('select * from ' + tableName, '#layer { marker-fill: red; }');

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

                assert.equal(res.headers['x-layergroup-id'], parsed.layergroupid);

                done();
            }
        );
    });

    it("creates layergroup fails when postgresql queries fail to figure affected tables in query",  function(done) {

        var runQueryFn = PgQueryRunner.prototype.run;
        PgQueryRunner.prototype.run = function(username, query, callback) {
            return callback(new Error('fake error message'), []);
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
                    errors: ["could not get overviews metadata: fake error message"]
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

                keysToDelete['map_cfg|' + LayergroupToken.parse(JSON.parse(res.body).layergroupid).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;

                var affectedFn = QueryTables.getAffectedTablesFromQuery;
                QueryTables.getAffectedTablesFromQuery = function(sql, username, query, callback) {
                    affectedFn({query: function(query, callback) {
                        return callback(new Error('fake error message'), []);
                    }}, username, query, callback);
                };

                // reset internal cacheChannel cache
                server.layergroupAffectedTablesCache.cache.reset();

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
                        QueryTables.getAffectedTablesFromQuery = affectedFn;
                        done();
                    }
                );
            }
        );
    });

});
