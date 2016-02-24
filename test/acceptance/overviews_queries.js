var testHelper = require('../support/test_helper');
var assert = require('../support/assert');

var cartodbServer = require('../../lib/cartodb/server');
var ServerOptions = require('./ported/support/ported_server_options');
var testClient = require('./ported/support/test_client');
var BaseController = require('../../lib/cartodb/controllers/base');

describe('overviews_queries', function() {

    var server = cartodbServer(ServerOptions);
    server.setMaxListeners(0);

    var IMAGE_EQUALS_TOLERANCE_PER_MIL = 2;

    var req2paramsFn;
    before(function() {
        req2paramsFn = BaseController.prototype.req2params;
        BaseController.prototype.req2params = ServerOptions.req2params;
    });

    after(function() {
        BaseController.prototype.req2params = req2paramsFn;

        testHelper.rmdirRecursiveSync(global.environment.millstone.cache_basedir);
    });

    function imageCompareFn(fixture, done) {
        return function(err, tile) {
            if (err) {
                return done(err);
            }
            var referenceImagePath = './test/fixtures/' + fixture;
            assert.imageBufferIsSimilarToFile(tile.body, referenceImagePath, IMAGE_EQUALS_TOLERANCE_PER_MIL, done);
        };
    }

    it("should not use overview for tables without overviews", function(done){
      testClient.getTile(testClient.defaultTableMapConfig('test_table'), 1, 0, 0,
          imageCompareFn('test_table_1_0_0.png', done)
      );
    });

    it("should not use overview for tables without overviews at z=2", function(done){
      testClient.getTile(testClient.defaultTableMapConfig('test_table'), 2, 1, 1,
          imageCompareFn('test_table_2_1_1.png', done)
      );
    });

    it("should not use overview for tables without overviews at z=2", function(done){
      testClient.getTile(testClient.defaultTableMapConfig('test_table'), 3, 3, 3,
          imageCompareFn('test_table_3_3_3.png', done)
      );
    });

    it("should use overview for zoom level 1", function(done){
      testClient.getTile(testClient.defaultTableMapConfig('test_table_overviews'), 1, 0, 0,
          imageCompareFn('_vovw_1_test_table_1_0_0.png', done)
      );
    });

    it("should use overview for zoom level 1", function(done){
      testClient.getTile(testClient.defaultTableMapConfig('test_table_overviews'), 2, 1, 1,
          imageCompareFn('_vovw_2_test_table_2_1_1.png', done)
      );
    });

    it("should not use overview for zoom level 3", function(done){
      testClient.getTile(testClient.defaultTableMapConfig('test_table_overviews'), 3, 3, 3,
          imageCompareFn('test_table_3_3_3.png', done)
      );
    });
});
