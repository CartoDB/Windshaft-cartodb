require('../support/test_helper');

var assert = require('../support/assert');
var TestClient = require('../support/test-client');

describe('regressions', function() {

    var ERROR_RESPONSE = {
        status: 400,
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    };

    it('should expose a nice error when missing sql option', function(done) {
        var mapConfig = {
            version: '1.5.0',
            layers: [
                {
                    "type": "cartodb",
                    "options": {
                        "cartocss": '#polygons { polygon-fill: red; }',
                        "cartocss_version": "2.3.0"
                    }
                }
            ]
        };

        var testClient = new TestClient(mapConfig, 1234);

        testClient.getLayergroup(ERROR_RESPONSE, function(err, layergroupResult) {
            assert.ok(!err, err);

            assert.equal(layergroupResult.errors.length, 1);
            assert.equal(layergroupResult.errors[0], 'Missing sql for layer 0 options');

            testClient.drain(done);
        });
    });
});
