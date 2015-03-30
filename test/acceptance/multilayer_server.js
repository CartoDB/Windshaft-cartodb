require(__dirname + '/../support/test_helper');

var assert = require('../support/assert');

var redis = require('redis');
var _ = require('underscore');

var CartodbWindshaft = require('../../lib/cartodb/cartodb_windshaft');
var serverOptions = require('../../lib/cartodb/server_options')();
var server = new CartodbWindshaft(serverOptions);
server.setMaxListeners(0);

describe('tests from old api translated to multilayer', function() {

    var test_database = _.template(global.environment.postgres_auth_user, {user_id:1}) + '_db';

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

    function createRequest(layergroup, userHost) {
        return {
            url: layergroupUrl,
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
    it("Specifying zoom level in CartoCSS does not need a 'zoom' variable in SQL output", function(done){
        // NOTE: may fail if grainstore < 0.3.0 is used by Windshaft
        var sql = "SELECT 'SRID=3857;POINT(0 0)'::geometry as the_geom_webmercator, 1::int as cartodb_id";
        var cartocss = '#gadm4 [ zoom>=3] { marker-fill:red; }';

        var layergroup = singleLayergroupConfig(sql, cartocss);

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

});
