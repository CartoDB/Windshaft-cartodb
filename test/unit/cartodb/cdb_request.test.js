require('../../support/test_helper');
var assert = require('assert');

var CdbRequest = require('../../../lib/cartodb/models/cdb_request');

describe('req2params', function() {

    function createRequest(host, userParam) {
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

    it('extracts name from host header', function() {
        var cdbRequest = new CdbRequest();
        var user = cdbRequest.userByReq(createRequest('localhost'));

        assert.equal(user, 'localhost');
    });

    it('extracts name from subdomain host header in case of no config', function() {
        var userFromHostConfig = global.environment.user_from_host;
        global.environment.user_from_host = null;

        var cdbRequest = new CdbRequest();
        var user = cdbRequest.userByReq(createRequest('development.localhost.lan'));

        global.environment.user_from_host = userFromHostConfig;

        assert.equal(user, 'development');
    });

    it('considers user param before headers', function() {
        var cdbRequest = new CdbRequest();
        var user = cdbRequest.userByReq(createRequest('localhost', 'development'));

        assert.equal(user, 'development');
    });

    it('returns undefined when it cannot extract username', function() {
        var userFromHostConfig = global.environment.user_from_host;
        global.environment.user_from_host = null;

        var cdbRequest = new CdbRequest();
        var user = cdbRequest.userByReq(createRequest('localhost'));

        global.environment.user_from_host = userFromHostConfig;

        assert.equal(user, undefined);
    });
});
