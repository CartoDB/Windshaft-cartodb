'use strict';

var testHelper = require('../../support/test-helper');

var assert = require('../../support/assert');
var fs = require('fs');
var PortedServerOptions = require('./support/ported-server-options');
var http = require('http');
var testClient = require('./support/test-client');
var nock = require('nock');
var path = require('path');

describe('external resources', function () {
    var resServ; // resources server
    var resServStatus = { numrequests: 0 }; // status of resources server
    var resServPort;

    var IMAGE_EQUALS_TOLERANCE_PER_MIL = 25;

    before(function (done) {
        // Start a server to test external resources
        resServ = http.createServer(function (request, response) {
            ++resServStatus.numrequests;
            var filename = path.join(__dirname, '/../../fixtures/markers', request.url);
            fs.readFile(filename, 'binary', function (err, file) {
                if (err) {
                    response.writeHead(404, { 'Content-Type': 'text/plain' });
                    response.write('404 Not Found\n');
                } else {
                    response.writeHead(200);
                    response.write(file, 'binary');
                }
                response.end();
            });
        });

        const host = '127.0.0.1';
        const markersServer = resServ.listen(0);

        resServPort = markersServer.address().port;

        nock.disableNetConnect();
        nock.enableNetConnect(host);

        markersServer.on('listening', done);
    });

    after(function (done) {
        testHelper.rmdirRecursiveSync(global.environment.millstone.cache_basedir);

        nock.cleanAll();
        nock.enableNetConnect();

        // Close the resources server
        resServ.close(done);
    });

    function imageCompareFn (fixture, done) {
        return function (err, res) {
            if (err) {
                return done(err);
            }
            var referenceImagePath = './test/fixtures/' + fixture;
            assert.imageBufferIsSimilarToFile(res.body, referenceImagePath, IMAGE_EQUALS_TOLERANCE_PER_MIL, done);
        };
    }

    it('basic external resource', function (done) {
        var circleStyle = "#test_table_3 { marker-file: url('http://127.0.0.1:" + resServPort +
            "/circle.svg'); marker-transform:'scale(0.2)'; }";

        testClient.getTile(testClient.defaultTableMapConfig('test_table_3', circleStyle), 13, 4011, 3088,
            imageCompareFn('test_table_13_4011_3088_svg1.png', done));
    });

    it('different external resource', function (done) {
        var squareStyle = "#test_table_3 { marker-file: url('http://127.0.0.1:" + resServPort +
            "/square.svg'); marker-transform:'scale(0.2)'; }";

        testClient.getTile(testClient.defaultTableMapConfig('test_table_3', squareStyle), 13, 4011, 3088,
            imageCompareFn('test_table_13_4011_3088_svg2.png', done));
    });

    // See http://github.com/CartoDB/Windshaft/issues/107
    it('external resources get localized on renderer creation if not locally cached', function (done) {
        var options = {
            serverOptions: PortedServerOptions
        };

        var externalResourceStyle = "#test_table_3{marker-file: url('http://127.0.0.1:" + resServPort +
          "/square.svg'); marker-transform:'scale(0.2)'; }";

        var externalResourceMapConfig = testClient.defaultTableMapConfig('test_table_3', externalResourceStyle);

        testClient.createLayergroup(externalResourceMapConfig, options, function () {
            var externalResourceRequestsCount = resServStatus.numrequests;

            testClient.createLayergroup(externalResourceMapConfig, options, function () {
                assert.strictEqual(resServStatus.numrequests, externalResourceRequestsCount);

                // reset resources cache
                testHelper.rmdirRecursiveSync(global.environment.millstone.cache_basedir);

                externalResourceMapConfig = testClient.defaultTableMapConfig('test_table_3 ', externalResourceStyle);

                testClient.createLayergroup(externalResourceMapConfig, options, function () {
                    assert.strictEqual(resServStatus.numrequests, externalResourceRequestsCount + 1);

                    done();
                });
            });
        });
    });

    it('referencing unexistant external resources returns an error', function (done) {
        var url = 'http://127.0.0.1:' + resServPort + '/notfound.png';
        var style = "#test_table_3{marker-file: url('" + url + "'); marker-transform:'scale(0.2)'; }";

        var mapConfig = testClient.defaultTableMapConfig('test_table_3', style);

        testClient.createLayergroup(mapConfig, { statusCode: 400 }, function (err, res) {
            assert.ifError(err);
            assert.deepStrictEqual(JSON.parse(res.body).errors, [
                "Unable to download '" + url + "' for 'style0' (server returned 404)"]
            );
            done();
        });
    });
});
