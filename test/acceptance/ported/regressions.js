var testHelper = require('../../support/test_helper');

var assert = require('../../support/assert');
var ServerOptions = require('./support/ported_server_options');
var testClient = require('./support/test_client');

var BaseController = require('../../../lib/cartodb/controllers/base');

describe('regressions', function() {

    var req2paramsFn;
    before(function() {
        req2paramsFn = BaseController.prototype.req2params;
        BaseController.prototype.req2params = ServerOptions.req2params;
    });


    after(function() {
        BaseController.prototype.req2params = req2paramsFn;
        testHelper.rmdirRecursiveSync(global.environment.millstone.cache_basedir);
    });

    // See https://github.com/Vizzuality/Windshaft/issues/65
    it("#65 catching non-Error exception doesn't kill the backend", function(done) {
        var mapConfig = testClient.defaultTableMapConfig('test_table');
        testClient.withLayergroup(mapConfig, function(err, requestTile, finish) {
            var options = {
                statusCode: 400,
                contentType: 'application/json; charset=utf-8'
            };
            requestTile('/0/0/0.png?testUnexpectedError=1', options, function(err, res) {
                assert.deepEqual(JSON.parse(res.body), { "errors": ["test unexpected error"] });
                finish(done);
            });
        });
    });

    // Test that you cannot write to the database from a tile request
    //
    // See http://github.com/CartoDB/Windshaft/issues/130
    // [x] Needs a fix on the mapnik side: https://github.com/mapnik/mapnik/pull/2143
    //
    it("#130 database access is read-only", function(done) {

        var writeSqlMapConfig = testClient.singleLayerMapConfig(
            'select st_point(0,0) as the_geom, * from test_table_inserter(st_setsrid(st_point(0,0),4326),\'write\')'
        );

        var expectedResponse = {
            status: 400,
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            }
        };

        testClient.getTile(writeSqlMapConfig, 0, 0, 0, expectedResponse, function(err, res) {
            var parsedBody = JSON.parse(res.body);
            assert.ok(parsedBody.errors);
            assert.equal(parsedBody.errors.length, 1);
            assert.ok(parsedBody.errors[0].match(/read-only transaction/), 'read-only error message expected');
            done();
        });
    });
});
