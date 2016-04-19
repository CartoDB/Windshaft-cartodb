var test_helper = require('../support/test_helper');

var assert = require('../support/assert');
var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/server');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);

var LayergroupToken = require('../../lib/cartodb/models/layergroup_token');

var RedisPool = require('redis-mpool');

var step = require('step');

var windshaft = require('windshaft');


describe('overviews metadata for named maps', function() {
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

    var templateId = 'overviews-template-1';

    var template = {
        version: '0.0.1',
        name: templateId,
        auth: { method: 'open' },
        layergroup:  {
            version: '1.0.0',
            layers: [overviews_layer, non_overviews_layer]
        }
    };

    it("should add overviews data to layers", function(done) {
      step(
        function postTemplate()
        {
          var next = this;

          assert.response(server, {
              url: '/api/v1/map/named?api_key=1234',
              method: 'POST',
              headers: {host: 'localhost', 'Content-Type': 'application/json' },
              data: JSON.stringify(template)
          }, {}, function(res, err) {
                     next(err, res);
          });
        },
        function checkTemplate(err, res) {
            assert.ifError(err);

            var next = this;
            assert.equal(res.statusCode, 200);
            assert.deepEqual(JSON.parse(res.body), {
                template_id: templateId
            });
            next(null);
        },
        function instantiateTemplate(err) {
            assert.ifError(err);

            var next = this;
            assert.response(server, {
                url: '/api/v1/map/named/' + templateId,
                method: 'POST',
                headers: {
                    host: 'localhost',
                    'Content-Type': 'application/json'
                }
            }, {},
            function(res, err) {
                return next(err, res);
            });

        },
        function checkInstanciation(err, res) {
            assert.ifError(err);

            var next = this;

            assert.equal(res.statusCode, 200);

            var parsedBody = JSON.parse(res.body);

            keysToDelete['map_cfg|' + LayergroupToken.parse(parsedBody.layergroupid).token] = 0;
            keysToDelete['user:localhost:mapviews:global'] = 5;

            assert.ok(parsedBody.layergroupid);
            assert.ok(parsedBody.last_updated);

            next(null, parsedBody.layergroupid);
        },

        function checkMapconfig(err, layergroupId)
        {
            assert.ifError(err);

            var next = this;

            var mapStore  = new windshaft.storage.MapStore({
                pool: redisPool,
                expire_time: 500000
            });
            mapStore.load(LayergroupToken.parse(layergroupId).token, function(err, mapConfig) {
              assert.ifError(err);
              assert.deepEqual(non_overviews_layer, mapConfig._cfg.layers[1]);
              assert.equal(mapConfig._cfg.layers[0].type, 'cartodb');
              assert.ok(mapConfig._cfg.layers[0].options.query_rewrite_data);
              var expected_data = {
                overviews: {
                  test_table_overviews: {
                    schema: 'public',
                    1: { table: '_vovw_1_test_table_overviews' },
                    2: { table: '_vovw_2_test_table_overviews' }
                  }
                }
              };
              assert.deepEqual(mapConfig._cfg.layers[0].options.query_rewrite_data, expected_data);
            });

            next(err);
        },
        function deleteTemplate(err) {
            assert.ifError(err);

            var next = this;

            assert.response(server, {
                url: '/api/v1/map/named/' + templateId + '?api_key=1234',
                method: 'DELETE',
                headers: { host: 'localhost' }
            }, {}, function (res, err) {
                next(err, res);
            });
        },
        function checkDeleteTemplate(err, res) {
            assert.ifError(err);
            assert.equal(res.statusCode, 204);
            assert.ok(!res.body);

            return null;
        },
        function finish(err) {
            done(err);
        }
      );
    });
});
