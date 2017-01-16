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

    function aggregationOperationMapConfig(operation, column, aggregationColumn) {
        column = column || 'adm0name';
        aggregationColumn = aggregationColumn || 'pop_max';

        var mapConfig = {
            version: '1.5.0',
            layers: [
                {
                    type: 'mapnik',
                    options: {
                        sql: 'select * from populated_places_simple_reduced',
                        cartocss: '#layer0 { marker-fill: red; marker-width: 10; }',
                        cartocss_version: '2.0.1',
                        widgets: {}
                    }
                }
            ]
        };

        mapConfig.layers[0].options.widgets[column] = {
            type: 'aggregation',
            options: {
                column: column,
                aggregation: operation,
                aggregationColumn: aggregationColumn
            }
        };

        return mapConfig;
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

    it('should count NULL category', function (done) {
        this.testClient = new TestClient(aggregationOperationMapConfig('count', 'namepar'));
        this.testClient.getDataview('namepar', { own_filter: 0 }, function (err, aggregation) {
            assert.ifError(err);

            assert.ok(aggregation);
            assert.equal(aggregation.type, 'aggregation');
            assert.ok(aggregation.categories);

            var hasNullCategory = false;
            aggregation.categories.forEach(function (category) {
                if (category.category === null) {
                    assert.ok(category.value > 0);
                    hasNullCategory = true;
                }
            });
            assert.ok(hasNullCategory, 'there is no category NULL');

            done();
        });
    });
});
