require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

describe('aggregations', function() {

    afterEach(function(done) {
        if (this.testClient) {
            this.testClient.drain(done);
        } else {
            done();
        }
    });

    function aggregationOperationMapConfig(operation) {
        return {
            version: '1.5.0',
            layers: [
                {
                    type: 'mapnik',
                    options: {
                        sql: 'select * from populated_places_simple_reduced',
                        cartocss: '#layer0 { marker-fill: red; marker-width: 10; }',
                        cartocss_version: '2.0.1',
                        widgets: {
                            adm0name: {
                                type: 'aggregation',
                                options: {
                                    column: 'adm0name',
                                    aggregation: operation,
                                    aggregationColumn: 'pop_max'
                                }
                            }
                        }
                    }
                }
            ]
        };
    }

    var operations = ['count', 'sum', 'avg', 'max', 'min'];

    operations.forEach(function(operation) {
        it('should be able to use "' + operation + '" as aggregation operation', function(done) {

            this.testClient = new TestClient(aggregationOperationMapConfig(operation));
            this.testClient.getDataview('adm0name', { own_filter: 0 }, function (err, aggregation) {
                assert.ok(!err, err);
                assert.ok(aggregation);

                assert.equal(aggregation.type, 'aggregation');
                assert.equal(aggregation.aggregation, operation);

                done();
            });
        });
    });
});
