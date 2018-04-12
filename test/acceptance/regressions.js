require('../support/test_helper');
var assert = require('../support/assert');
var TestClient = require('../support/test-client');
const LayergroupToken = require('../../lib/cartodb/models/layergroup-token');

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

        testClient.getLayergroup({ response: ERROR_RESPONSE }, function(err, layergroupResult) {
            assert.ok(!err, err);

            assert.equal(layergroupResult.errors.length, 1);
            assert.equal(layergroupResult.errors[0], 'Missing sql for layer 0 options');

            testClient.drain(done);
        });
    });

    describe('map instantiation', function () {
        const apikeyToken = 'regular1';
        const mapConfig = {
            version: '1.7.0',
            layers: [{
                type: 'cartodb',
                options: {
                    sql: 'select * from test_table_localhost_regular1',
                    cartocss: TestClient.CARTOCSS.POINTS,
                    cartocss_version: '2.3.0'
                }
            }]
        };

        it('should have distint timestamps when the source was updated', function (done) {
            const testClient = new TestClient(mapConfig, apikeyToken);

            testClient.getLayergroup({}, (err, layergroup) => {
                if (err) {
                    return done(err);
                }

                const { cacheBuster: cacheBusterA } = LayergroupToken.parse(layergroup.layergroupid);

                const conn = testClient.getDBConnection();

                const sql = `select CDB_TableMetadataTouch('test_table_localhost_regular1'::regclass)`;

                conn.query(sql, (err) => {
                    if (err) {
                        return done(err);
                    }

                    testClient.getLayergroup({}, (err, layergroup) => {
                        if (err) {
                            return done(err);
                        }

                        const { cacheBuster: cacheBusterB } = LayergroupToken.parse(layergroup.layergroupid);

                        const timestampA = parseInt(cacheBusterA, 10);
                        const timestampB = parseInt(cacheBusterB, 10);

                        assert.notEqual(timestampA, timestampB);
                        assert.ok(timestampA < timestampB, `timestampA: ${timestampA} > timestampB:${timestampB}`);

                        testClient.drain(done);
                    });
                });
            });
        });
    });
});
