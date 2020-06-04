'use strict';

require('../support/test-helper');
var assert = require('assert');

var CdbRequest = require('../../lib/models/cdb-request');

describe('username in host header (CdbRequest)', function () {
    function createRequest (host, userParam) {
        var req = {
            params: {},
            headers: {
                host: host
            }
        };

        if (userParam) {
            req.params.user = userParam;
        }

        return req;
    }

    it('extracts name from host header', function () {
        var cdbRequest = new CdbRequest();
        var user = cdbRequest.userByReq(createRequest('localhost'));

        assert.strictEqual(user, 'localhost');
    });

    it('extracts name from subdomain host header in case of no config', function () {
        var userFromHostConfig = global.environment.user_from_host;
        global.environment.user_from_host = null;

        var cdbRequest = new CdbRequest();
        var user = cdbRequest.userByReq(createRequest('development.localhost.lan'));

        global.environment.user_from_host = userFromHostConfig;

        assert.strictEqual(user, 'development');
    });

    it('considers user param before headers', function () {
        var cdbRequest = new CdbRequest();
        var user = cdbRequest.userByReq(createRequest('localhost', 'development'));

        assert.strictEqual(user, 'development');
    });

    it('returns throw when it cannot extract username', function () {
        var userFromHostConfig = global.environment.user_from_host;
        global.environment.user_from_host = null;

        var cdbRequest = new CdbRequest();
        assert.throws(() => cdbRequest.userByReq(createRequest('localhost')));

        global.environment.user_from_host = userFromHostConfig;
    });

    it('should throw for undefined host header', function () {
        var userFromHostConfig = global.environment.user_from_host;
        global.environment.user_from_host = null;

        var cdbRequest = new CdbRequest();
        assert.throws(() => cdbRequest.userByReq(createRequest(undefined)));

        global.environment.user_from_host = userFromHostConfig;
    });

    it('should throw for null host header', function () {
        var userFromHostConfig = global.environment.user_from_host;
        global.environment.user_from_host = null;

        var cdbRequest = new CdbRequest();
        assert.throws(() => cdbRequest.userByReq(createRequest(null)));

        global.environment.user_from_host = userFromHostConfig;
    });
});
