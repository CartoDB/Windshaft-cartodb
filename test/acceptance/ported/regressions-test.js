'use strict';

var testHelper = require('../../support/test-helper');

var assert = require('../../support/assert');
var testClient = require('./support/test-client');

describe('regressions', function () {
    after(function () {
        testHelper.rmdirRecursiveSync(global.environment.millstone.cache_basedir);
    });

    // Test that you cannot write to the database from a tile request
    //
    // See http://github.com/CartoDB/Windshaft/issues/130
    // [x] Needs a fix on the mapnik side: https://github.com/mapnik/mapnik/pull/2143
    //
    it('#130 database access is read-only', function (done) {
        var writeSqlMapConfig = testClient.singleLayerMapConfig(
            'select st_point(0,0) as the_geom, * from test_table_inserter(st_setsrid(st_point(0,0),4326),\'write\')'
        );

        var expectedResponse = {
            status: 400,
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            }
        };

        testClient.getTile(writeSqlMapConfig, 0, 0, 0, expectedResponse, function (err, res) {
            assert.ifError(err);
            var parsedBody = JSON.parse(res.body);
            assert.ok(parsedBody.errors);
            assert.strictEqual(parsedBody.errors.length, 1);
            assert.ok(parsedBody.errors[0].match(/read-only transaction/), 'read-only error message expected');
            done();
        });
    });
});
