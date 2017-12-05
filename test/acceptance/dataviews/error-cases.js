require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

describe('histogram-dataview', function() {

    afterEach(function(done) {
        if (this.testClient) {
            this.testClient.drain(done);
        } else {
            done();
        }
    });

    var ERROR_RESPONSE = {
        status: 400,
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    };

    function createMapConfig(dataviews) {
        return {
            version: '1.5.0',
            layers: [
                {
                    "type": "cartodb",
                    "options": {
                        "source": {
                            "id": "HEAD"
                        },
                        "cartocss": "#points { marker-width: 10; marker-fill: red; }",
                        "cartocss_version": "2.3.0"
                    }
                }
            ],
            dataviews: dataviews,
            analyses: [
                {
                    "id": "HEAD",
                    "type": "source",
                    "params": {
                        "query": "select null::geometry the_geom_webmercator, x from generate_series(0,1000) x"
                    }
                }
            ]
        };
    }

    it('should fail when invalid dataviews object is provided, string case', function(done) {
        var mapConfig = createMapConfig("wadus-string");
        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getLayergroup({ response: ERROR_RESPONSE }, function(err, errObj) {
            assert.ok(!err, err);

            assert.deepEqual(errObj.errors, [ '"dataviews" must be a valid JSON object: "string" type found' ]);

            done();
        });
    });

    it('should fail when invalid dataviews object is provided, array case', function(done) {
        var mapConfig = createMapConfig([]);
        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getLayergroup({ response: ERROR_RESPONSE }, function(err, errObj) {
            assert.ok(!err, err);

            assert.deepEqual(errObj.errors, [ '"dataviews" must be a valid JSON object: "array" type found' ]);

            done();
        });
    });

    it('should work with empty but valid objects', function(done) {
        var mapConfig = createMapConfig({});
        this.testClient = new TestClient(mapConfig, 1234);
        this.testClient.getLayergroup(function(err, layergroup) {
            assert.ok(!err, err);

            assert.ok(layergroup);
            assert.ok(layergroup.layergroupid);

            done();
        });
    });
});
