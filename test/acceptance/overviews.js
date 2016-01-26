var _ = require('underscore');
var test_helper = require('../support/test_helper');

var assert = require('../support/assert');
var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/server');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);

var LayergroupToken = require('../../lib/cartodb/models/layergroup_token');

var RedisPool = require('redis-mpool');

var step = require('step');

var windshaft = require('windshaft');


describe('overviews', function() {
    // configure redis pool instance to use in tests
    var redisPool = new RedisPool(global.environment.redis);

    var overviews_layer = {
        type: 'cartodb',
        options: {
            sql: 'SELECT * FROM test_table_overviews',
            cartocss: '#layer { marker-fill: black; }',
            cartocss_version: '2.3.0'
        }
    };

    var non_overviews_layer = {
        type: 'cartodb',
        options: {
            sql: 'SELECT * FROM test_table',
            cartocss: '#layer { marker-fill: black; }',
            cartocss_version: '2.3.0'
        }
    };

    var keysToDelete;

    beforeEach(function() {
        keysToDelete = {};
    });

    afterEach(function(done) {
        test_helper.deleteRedisKeys(keysToDelete, done);
    });

    it("layers with and without overviews", function(done) {

      var layergroup =  {
        version: '1.0.0',
        layers: [overviews_layer, non_overviews_layer]
      };

      var layergroup_url = '/api/v1/map';

      var expected_token;
      step(
        function do_post()
        {
          var next = this;
          assert.response(server, {
              url: layergroup_url,
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(layergroup)
          }, {}, function(res) {
              assert.equal(res.statusCode, 200, res.body);
              var parsedBody = JSON.parse(res.body);
              assert.equal(res.headers['x-layergroup-id'], parsedBody.layergroupid);
              expected_token = parsedBody.layergroupid;
              next(null, res);
          });
        },
        function do_get_mapconfig(err)
        {
            assert.ifError(err);
            var next = this;

            var mapStore  = new windshaft.storage.MapStore({
                pool: redisPool,
                expire_time: 500000
            });
            mapStore.load(LayergroupToken.parse(expected_token).token, function(err, mapConfig) {
              assert.ifError(err);
              assert.deepEqual(non_overviews_layer, mapConfig._cfg.layers[1]);
              assert.equal(mapConfig._cfg.layers[0].type, 'cartodb');
              assert.ok(mapConfig._cfg.layers[0].options.overviews);
              assert.ok(mapConfig._cfg.layers[0].options.overviews.test_table_overviews);
              assert.deepEqual(_.keys(mapConfig._cfg.layers[0].options.overviews), ['test_table_overviews']);
              assert.equal(_.keys(mapConfig._cfg.layers[0].options.overviews.test_table_overviews).length, 2);
              assert.ok(mapConfig._cfg.layers[0].options.overviews.test_table_overviews[1]);
              assert.ok(mapConfig._cfg.layers[0].options.overviews.test_table_overviews[2]);
              assert.equal(
                  mapConfig._cfg.layers[0].options.overviews.test_table_overviews[1].table,
                  'test_table_overviews_ov1'
              );
              assert.equal(
                  mapConfig._cfg.layers[0].options.overviews.test_table_overviews[2].table,
                  'test_table_overviews_ov2'
              );
            });

            next(err);
        },
        function finish(err) {
            keysToDelete['map_cfg|' + LayergroupToken.parse(expected_token).token] = 0;
            keysToDelete['user:localhost:mapviews:global'] = 5;
            done(err);
        }
      );
    });
});
