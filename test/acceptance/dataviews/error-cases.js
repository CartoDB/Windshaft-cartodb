require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

describe('dataview error cases', function() {
    
    afterEach(function(done) {
        if (this.testClient) {
            this.testClient.drain(done);
        } else {
            done();
        }
    });

    describe('generic errors', function() {
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

    describe('pg_typeof', function() {

        afterEach(function(done) {
            if (this.testClient) {
                this.testClient.drain(done);
            } else {
                done();
            }
        });

        function createMapConfig(query) {
            query = query || 'select * from populated_places_simple_reduced';

            return {
                version: '1.5.0',
                layers: [
                    {
                        type: 'mapnik',
                        options: {
                            sql: query,
                            cartocss: '#layer0 { marker-fill: red; marker-width: 10; }',
                            cartocss_version: '2.0.1',
                            source: { id: "a0" }
                        }
                    }
                ],
                analyses: [{
                    id: "a0",
                    type: "source",
                    params: {
                        query: query
                    }
                }],
                dataviews:  {
                    aggregation_count_dataview: {
                        type: "aggregation",
                        source: { id: "a0" },
                        options: {
                            column: "adm0name",
                            aggregation: "count",
                            aggregationColumn: "adm0name"
                        }
                    },

                    formula_count_dataview: {
                        type: 'formula',
                        source: { id: "a0" },
                        options: {
                            column: 'adm0_a3',
                            operation: 'count'
                        }
                    },
                }
            };    
        }

        it('should work without filters', function(done) {
            this.testClient = new TestClient(createMapConfig());
            this.testClient.getDataview('aggregation_count_dataview', { own_filter: 0 }, function(err, result) {
                assert.ifError(err);
                done();
            });
        });

        it('should work with filters', function(done) {
            var params = {
                filters: {
                    dataviews: {aggregation_count_dataview: {accept: ['Canada']}}
                }
            };

            this.testClient = new TestClient(createMapConfig());
            this.testClient.getDataview('aggregation_count_dataview', params, function(err, result) {
                assert.ifError(err);
                done();
            });
        });

        it('should return an error if the column used by dataview does not exist', function(done) {
            const query = 'select cartodb_id, the_geom, the_geom_webmercator from populated_places_simple_reduced';

            const expectedResponse = {
                status: 404,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                }
            };

            const expectedResponseBody = {
                errors:['column "adm0name" does not exist'],
                errors_with_context:[{
                    type:'unknown',
                    message:'column "adm0name" does not exist'
                }]
            };

            this.testClient = new TestClient(createMapConfig(query));
            this.testClient.getDataview('aggregation_count_dataview', { response: expectedResponse }, function(err, result) {
                assert.ifError(err);
                assert.deepEqual(result, expectedResponseBody);
                done();
            });
        });
        
        it('should return an error if query row equals to 0', function(done) {
            const query = 'select * from populated_places_simple_reduced limit 0';

            this.testClient = new TestClient(createMapConfig(query));
            this.testClient.getDataview('aggregation_count_dataview', { own_filter: 0 }, function(err, result) {
                assert.ifError(err);
                done();
            });
        });


    });
});
