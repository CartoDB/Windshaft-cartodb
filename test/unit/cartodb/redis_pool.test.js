var assert = require('../../support/assert')
  , _ = require('underscore')
  , RedisPool = require('../../../lib/cartodb/redis_pool')
  , tests = module.exports = {};

suite('redis_pool', function() {

    // configure redis pool instance to use in tests
    var test_opts = {
      max: 10, 
      idleTimeoutMillis: 1, 
      reapIntervalMillis: 1
    };
    
    var redis_pool = new RedisPool(test_opts);

    test('RedisPool object exists', function(done){
      assert.ok(RedisPool);
      done();
    });
    
    test('RedisPool can create new redis_pool objects with default settings', function(done){
      var redis_pool = new RedisPool();
      done();
    });
    
    test('RedisPool can create new redis_pool objects with specific settings', function(done){
      var redis_pool = new RedisPool(_.extend({host:'127.0.0.1', port: '6379'}, test_opts));
      done();
    });
    
    
    test('pool object has an acquire function', function(done){
      var found=false;
      var functions = _.functions(redis_pool);
      for (var i=0; i<functions.length; ++i) {
          if ( functions[i] == 'acquire' ) { found=true; break; }
      }
      assert.ok(found);
      done();
    });
    
    test('calling aquire returns a redis client object that can get/set', function(done){
      redis_pool.acquire(0, function(err, client){
        client.set("key","value");
        client.get("key", function(err,data){      
          assert.equal(data, "value");      
          redis_pool.release(0, client); // needed to exit tests
          done();
        })
      });    
    });
    
    test('calling aquire on another DB returns a redis client object that can get/set', function(done){
      redis_pool.acquire(2, function(err, client){
        client.set("key","value");
        client.get("key", function(err,data){      
          assert.equal(data, "value");      
          redis_pool.release(2, client); // needed to exit tests
          done();
        })
      });      
    });

});
