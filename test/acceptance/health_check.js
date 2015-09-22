require(__dirname + '/../support/test_helper');

var fs = require('fs');

var assert = require('../support/assert');
var CartodbWindshaft = require('../../lib/cartodb/server');
var serverOptions = require('../../lib/cartodb/server_options');

describe('health checks', function () {

    function enableHealthConfig() {
        global.environment.health = {
            enabled: true
        };
    }

    function disableHealthConfig() {
        global.environment.health = {
            enabled: false
        };
    }

    var healthCheckRequest = {
        url: '/health',
        method: 'GET',
        headers: {
            host: 'localhost'
        }
    };

    beforeEach(enableHealthConfig);
    afterEach(disableHealthConfig);

    var RESPONSE_OK = {
        status: 200
    };

    var RESPONSE_FAIL = {
        status: 503
    };

    it('returns 200 and ok=true with enabled configuration', function (done) {
        var server = new CartodbWindshaft(serverOptions);

        assert.response(server, healthCheckRequest, RESPONSE_OK, function (res, err) {
            assert.ok(!err);

            var parsed = JSON.parse(res.body);

            assert.ok(parsed.enabled);
            assert.ok(parsed.ok);

            done();
        });
    });

    it('error if disabled file exists', function(done) {
        var errorMessage = "Maintenance";

        var readFileFn = fs.readFile;
        fs.readFile = function(filename, callback) {
            callback(null, errorMessage);
        };
        var server = new CartodbWindshaft(serverOptions);

        assert.response(server, healthCheckRequest, RESPONSE_FAIL, function(res, err) {
            fs.readFile = readFileFn;

            assert.ok(!err);
            var parsed = JSON.parse(res.body);
            assert.ok(parsed.enabled);
            assert.ok(!parsed.ok);
            assert.equal(parsed.err, errorMessage);

            done();
        });
    });

    it('no error if disabled file exists but has no content', function(done) {
        var readFileFn = fs.readFile;
        fs.readFile = function(filename, callback) {
            callback(null, '');
        };
        var server = new CartodbWindshaft(serverOptions);

        assert.response(server, healthCheckRequest, RESPONSE_OK, function(res, err) {
            fs.readFile = readFileFn;

            assert.ok(!err);
            var parsed = JSON.parse(res.body);

            assert.equal(parsed.enabled, true);
            assert.equal(parsed.ok, true);

            done();
        });
    });

    it('not err if disabled file does not exists', function(done) {
        global.environment.disabled_file = '/tmp/ftreftrgtrccre';

        var server = new CartodbWindshaft(serverOptions);

        assert.response(server, healthCheckRequest, RESPONSE_OK, function (res, err) {
            assert.ok(!err);

            var parsed = JSON.parse(res.body);

            assert.equal(parsed.enabled, true);
            assert.equal(parsed.ok, true);

            done();
        });
    }); 

});
