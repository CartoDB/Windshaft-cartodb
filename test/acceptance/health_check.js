require(__dirname + '/../support/test_helper');

var assert      = require('../support/assert');
var CartodbWindshaft = require('../../lib/cartodb/server');
var serverOptions = require('../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);

var metadataBackend = {};
var tilelive = {};
var HealthCheck = require('../../lib/cartodb/monitoring/health_check');
var healthCheck = new HealthCheck(metadataBackend, tilelive);

describe('health checks', function () {

    function resetHealthConfig() {
        global.environment.health = {
            enabled: true,
            username: 'localhost',
            z: 0,
            x: 0,
            y: 0
        };
    }

    var healthCheckRequest = {
        url: '/health',
        method: 'GET',
        headers: {
            host: 'localhost'
        }
    };

    it('returns 200 and ok=true with enabled configuration', function (done) {
        resetHealthConfig();

        assert.response(server,
            healthCheckRequest,
            {
                status: 200
            },
            function (res, err) {
                assert.ok(!err);

                var parsed = JSON.parse(res.body);

                assert.ok(parsed.enabled);
                assert.ok(parsed.ok);

                done();
            }
        );
    });

    it('error if disabled file exists', function(done) {
      var fs = require('fs');

      var readFileFn = fs.readFile;
      fs.readFile = function(filename, callback) {
        callback(null, "Maintenance");
      };
      
      healthCheck.check(null, function(err/*, result*/) {
        assert.equal(err.message, "Maintenance");
        assert.equal(err.http_status, 503);
        done();
        fs.readFile = readFileFn;
      }); 
      
    }); 

    it('not err if disabled file does not exists', function(done) {
      resetHealthConfig();

      global.environment.disabled_file = '/tmp/ftreftrgtrccre';

      assert.response(server,
        healthCheckRequest,
        {
          status: 200
        },
        function (res, err) {
          assert.ok(!err);

          var parsed = JSON.parse(res.body);

          assert.equal(parsed.enabled, true);
          assert.equal(parsed.ok, true);

          done();
        }
      );
    }); 

});
