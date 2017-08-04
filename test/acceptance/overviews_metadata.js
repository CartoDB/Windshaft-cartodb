var test_helper = require('../support/test_helper');

var assert = require('../support/assert');
var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/server');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);

var LayergroupToken = require('../../lib/cartodb/models/layergroup-token');

var RedisPool = require('redis-mpool');

var step = require('step');

var windshaft = require('windshaft');


describe('overviews metadata', function() {
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
            function finish(err) {
                keysToDelete['map_cfg|' + LayergroupToken.parse(expected_token).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;
                done(err);
            }
        );
    });
});

describe('overviews metadata with filters', function() {
    // configure redis pool instance to use in tests
    var redisPool = new RedisPool(global.environment.redis);

    var keysToDelete;

    beforeEach(function() {
        keysToDelete = {};
    });

    afterEach(function(done) {
        test_helper.deleteRedisKeys(keysToDelete, done);
    });

    it("layers with overviews", function(done) {

        var layergroup =  {
            version: '1.5.0',
            layers: [
              {
                  type: 'cartodb',
                  options: {
                      sql: 'SELECT * FROM test_table_overviews',
                      source: { id: 'with_overviews' },
                      cartocss: '#layer { marker-fill: black; }',
                      cartocss_version: '2.3.0'
                  }
              }
            ],
            dataviews:  {
                test_names: {
                    type: 'aggregation',
                    source: {id: 'with_overviews'},
                    options: {
                        column: 'name',
                        aggregation: 'count'
                    }
                }
            },
            analyses: [
                { id: 'with_overviews',
                    type: 'source',
                    params: {
                      query: 'select * from test_table_overviews'
                    }
                }
            ]
        };

        var filters = {
            dataviews: {
                test_names: { accept: ['Hawai'] }
            }
        };

        var layergroup_url = '/api/v1/map';

        var expected_token;
        step(
            function do_post()
            {
              var next = this;
              assert.response(server, {
                  url: layergroup_url + '?filters=' + JSON.stringify(filters),
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
                    assert.equal(mapConfig._cfg.layers[0].type, 'cartodb');
                    assert.ok(mapConfig._cfg.layers[0].options.query_rewrite_data);
                    var expected_data = {
                        overviews: {
                            test_table_overviews: {
                                schema: 'public',
                                1: { table: '_vovw_1_test_table_overviews' },
                                2: { table: '_vovw_2_test_table_overviews' }
                            }
                        },
                        filters: { test_names: { type: 'category', column: 'name', params: { accept: [ 'Hawai' ] } } },
                        unfiltered_query: 'select * from test_table_overviews',
                        filter_stats: { unfiltered_rows: 5, filtered_rows: 1 }
                      };
                    assert.deepEqual(mapConfig._cfg.layers[0].options.query_rewrite_data, expected_data);

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
