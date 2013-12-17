var assert = require('assert')
  //, _ = require('underscore')
  , RedisPool = require('redis-mpool')
  , SignedMaps = require('../../../lib/cartodb/signed_maps.js')
  , test_helper = require('../../support/test_helper')
  , Step = require('step')
  , tests = module.exports = {};

suite('signed_maps', function() {

    // configure redis pool instance to use in tests
    var redis_pool = RedisPool(global.environment.redis);
    
    test('can sign map with open and token-based auth', function(done) {
      var smap = new SignedMaps(redis_pool);
      assert.ok(smap);
      var sig = 'sig1';
      var map = 'map1';
      var tok = 'tok1';
      var crt = {
        version:'0.0.1',
        layergroup_id:map,
        auth: {}
      };
      var crt1_id; // by token
      var crt2_id; // open
      Step(
        function() {
          smap.isAuthorized(sig,map,tok,this);
        },
        function checkAuthFailure1(err, authorized) {
          if ( err ) throw err;
          assert.ok(!authorized, "unexpectedly authorized");
          crt.auth.method = 'token';
          crt.auth.valid_tokens = [tok];
          smap.addSignature(sig, map, crt, this)
        },
        function getCert1(err, id) {
          if ( err ) throw err;
          assert.ok(id, "undefined signature id");
          crt1_id = id; // keep note of it
//console.log("Certificate 1 is " + crt1_id);
          smap.isAuthorized(sig,map,'',this);
        },
        function checkAuthFailure2(err, authorized) {
          if ( err ) throw err;
          assert.ok(!authorized, "unexpectedly authorized");
          smap.isAuthorized(sig,map,tok,this);
        },
        function checkAuthSuccess1(err, authorized) {
          if ( err ) throw err;
          assert.ok(authorized, "unauthorized :(");
          crt.auth.method = 'open';
          delete crt.auth.valid_tokens;
          smap.addSignature(sig, map, crt, this)
        },
        function getCert2(err, id) {
          if ( err ) throw err;
          assert.ok(id, "undefined signature id");
          crt2_id = id; // keep note of it
//console.log("Certificate 2 is " + crt2_id);
          smap.isAuthorized(sig,map,'arbitrary',this);
        },
        function checkAuthSuccess2_delCert2(err, authorized) {
          if ( err ) throw err;
          assert.ok(authorized, "unauthorized :(");
          var next = this;
          smap.delCertificate(sig, crt2_id, function(e) {
            if (e) next(e);
            else smap.isAuthorized(sig,map,'arbitrary',next);
          });
        },
        function checkAuthFailure3_delCert2(err, authorized) {
          if ( err ) throw err;
          assert.ok(!authorized, "unexpectedly authorized");
          smap.delCertificate(sig, crt1_id, this);
        },
        function finish(err) {
          done(err);
        }
      );
    });

    
});
