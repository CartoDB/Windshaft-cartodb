require('../../support/test_helper');

const assert = require('../../support/assert');
const TestClient = require('../../support/test-client');

describe('authorization', function() {
    it('should create a layergroup with regular apikey token', function(done) {
        const apikeyToken = 'regular1';
        const mapConfig = {
            version: '1.7.0',
            layers: [
                {
                    options: {
                        sql: 'select * FROM test_table_localhost_regular1',
                        cartocss: TestClient.CARTOCSS.POINTS,
                        cartocss_version: '2.3.0'
                    }
                }
            ]
        };
        const testClient = new TestClient(mapConfig, apikeyToken);

        testClient.getLayergroup(function (err, layergroupResult) {
            assert.ifError(err);

            assert.ok(layergroupResult.layergroupid);

            testClient.drain(done);
        });
    });

    it('should fail if apikey does not gran access to table', function (done) {
        const mapConfig = {
            version: '1.7.0',
            layers: [
                {
                    options: {
                        sql: 'select * FROM test_table_localhost_regular1',
                        cartocss: TestClient.CARTOCSS.POINTS,
                        cartocss_version: '2.3.0'
                    }
                }
            ]
        };
        const testClient = new TestClient(mapConfig); //no apikey provided, using default

        testClient.getLayergroup({response: {status:403}}, function (err, layergroupResult) {
            assert.ifError(err);

            assert.ok(layergroupResult.hasOwnProperty('errors'));
            assert.equal(layergroupResult.errors.length, 1);
            assert.ok(layergroupResult.errors[0].match(/permission denied/), layergroupResult.errors[0]);
            
            testClient.drain(done);
        });
    });
});
