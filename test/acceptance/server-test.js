'use strict';

require('../support/test-helper');

var assert = require('../support/assert');
var querystring = require('querystring');
var step = require('step');

var CartodbWindshaft = require('../../lib/server');
var serverOptions = require('../../lib/server-options');

describe('server', function () {
    var server;

    before(function () {
        server = new CartodbWindshaft(serverOptions);
        server.setMaxListeners(0);
    });

    // TODO: I guess this should be a 404 instead...
    it('get call to server returns 200', function (done) {
        step(
            function doGet () {
                var next = this;
                assert.response(server, {
                    url: '/',
                    method: 'GET'
                }, {}, function (res, err) { next(err, res); });
            },
            function doCheck (err, res) {
                assert.ifError(err);
                assert.ok(res.statusCode, 200);
                var cc = res.headers['x-cache-channel'];
                assert.ok(!cc);
                return null;
            },
            function finish (err) {
                done(err);
            }
        );
    });
});

describe('server old_api', function () {
    var server;

    before(function () {
        server = new CartodbWindshaft(serverOptions);
        server.setMaxListeners(0);
    });

    // See https://github.com/CartoDB/Windshaft-cartodb/issues/115
    it.skip("get'ing tile with not-strictly-valid style", function (done) {
        var style = querystring.stringify({ style: '#test_table{line-color:black}}', style_version: '2.0.0' });
        assert.response(server, {
            headers: { host: 'localhost' },
            url: '/tiles/test_table/0/0/0.png?' + style, // madrid
            method: 'GET',
            encoding: 'binary'
        }, {}, function (res) {
            assert.strictEqual(res.statusCode, 200, res.statusCode + ': ' + res.body);
            done();
        });
    });
});
