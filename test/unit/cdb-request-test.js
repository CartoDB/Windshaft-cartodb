'use strict';

require('../support/test-helper');
var assert = require('assert');

var CdbRequest = require('../../lib/models/cdb-request');

describe('req2params', function () {
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

    it('returns undefined when it cannot extract username', function () {
        var userFromHostConfig = global.environment.user_from_host;
        global.environment.user_from_host = null;

        var cdbRequest = new CdbRequest();
        var user = cdbRequest.userByReq(createRequest('localhost'));

        global.environment.user_from_host = userFromHostConfig;

        assert.strictEqual(user, undefined);
    });

    it('should not fail for undefined host header', function () {
        var userFromHostConfig = global.environment.user_from_host;
        global.environment.user_from_host = null;

        var cdbRequest = new CdbRequest();
        var user = cdbRequest.userByReq(createRequest(undefined));

        global.environment.user_from_host = userFromHostConfig;

        assert.strictEqual(user, undefined);
    });

    it('should not fail for null host header', function () {
        var userFromHostConfig = global.environment.user_from_host;
        global.environment.user_from_host = null;

        var cdbRequest = new CdbRequest();
        var user = cdbRequest.userByReq(createRequest(null));

        global.environment.user_from_host = userFromHostConfig;

        assert.strictEqual(user, undefined);
    });
});
