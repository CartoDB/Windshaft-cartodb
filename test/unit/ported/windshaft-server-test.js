'use strict';

require('../../support/test-helper');

var assert = require('assert');
var cartodbServer = require('../../../lib/server');
var serverOptions = require('../../../lib/server-options');

describe('windshaft', function () {
    it('should have valid global environment', function () {
        assert.strictEqual(global.environment.name, 'test');
    });

    it('can instantiate a Windshaft object (configured express instance)', function () {
        var ws = cartodbServer(serverOptions);
        assert.ok(ws);
    });

    it('can spawn a new server on the global listen port', function (done) {
        var ws = cartodbServer(serverOptions);
        var server = ws.listen(global.environment.port, function () {
            assert.ok(ws);
            server.close(done); /* allow proper tear down */
        });
    });

    it('throws exception if incorrect options passed in', function () {
        assert.throws(
            function () {
                var ws = cartodbServer({ unbuffered_logging: true });
                ws.listen();
            }, /Must initialise server with/
        );
    });
});
