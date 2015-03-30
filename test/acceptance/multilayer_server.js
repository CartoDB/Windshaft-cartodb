var testHelper = require(__dirname + '/../support/test_helper');

var assert = require('../support/assert');

var redis = require('redis');

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
            stat_tag: 'random_tag',
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

});
