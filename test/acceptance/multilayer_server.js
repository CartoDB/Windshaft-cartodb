require(__dirname + '/../support/test_helper');

var assert      = require('../support/assert');

var redis       = require('redis');

var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/cartodb_windshaft');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options')();
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

    it("layergroup creation fails if CartoCSS is bogus", function(done) {
        var layergroup = singleLayergroupConfig(wadusSql, '#my_table3{');
        assert.response(server, {
            url: layergroupUrl,
            method: 'POST',
            headers: {host: 'localhost', 'Content-Type': 'application/json' },
            data: JSON.stringify(layergroup)
        }, {}, function(res) {
            assert.equal(res.statusCode, 400, res.body);
            var parsed = JSON.parse(res.body);
            assert.ok(parsed.errors[0].match(/^style0/));
            assert.ok(parsed.errors[0].match(/missing closing/));
            done();
        });
    });

    it("multiple bad styles returns 400 with all errors", function(done) {
        var layergroup = singleLayergroupConfig(wadusSql, '#my_table4{backgxxxxxround-color:#fff;foo:bar}');
        assert.response(server, {
            url: layergroupUrl,
            method: 'POST',
            headers: {host: 'localhost', 'Content-Type': 'application/json' },
            data: JSON.stringify(layergroup)
        }, {}, function(res) {
            assert.equal(res.statusCode, 400, res.body);
            var parsed = JSON.parse(res.body);
            assert.equal(parsed.errors.length, 1);
            assert.ok(parsed.errors[0].match(/^style0/));
            assert.ok(parsed.errors[0].match(/Unrecognized rule: backgxxxxxround-color/));
            assert.ok(parsed.errors[0].match(/Unrecognized rule: foo/));
            done();
        });
    });

});
