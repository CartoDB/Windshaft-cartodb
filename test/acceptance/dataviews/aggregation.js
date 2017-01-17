require('../../support/test_helper');

var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

describe('aggregations happy cases', function() {

    afterEach(function(done) {
        if (this.testClient) {
            this.testClient.drain(done);
        } else {
            done();
        }
    });

    function aggregationOperationMapConfig(operation, query, column, aggregationColumn) {
        column = column || 'adm0name';
        aggregationColumn = aggregationColumn || 'pop_max';
        query = query || 'select * from populated_places_simple_reduced';

        var mapConfig = {
            version: '1.5.0',
            layers: [
                {
                    type: 'mapnik',
                    options: {
                        sql: query,
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

    var query = [
        'select 1 as val, \'a\' as cat, ST_Transform(ST_SetSRID(ST_MakePoint(0,0),4326),3857) as the_geom_webmercator',
        'select null, \'b\', ST_Transform(ST_SetSRID(ST_MakePoint(0,1),4326),3857)',
        'select null, \'b\', ST_Transform(ST_SetSRID(ST_MakePoint(1,0),4326),3857)',
        'select null, null, ST_Transform(ST_SetSRID(ST_MakePoint(1,1),4326),3857)'
    ].join(' UNION ALL ');

    operations.forEach(function (operation) {
        var not = operation === 'count' ? ' not ' : ' ';
        var description = 'should' +
            not +
            'handle NULL values in category and aggregation columns using "' +
            operation +
            '" as aggregation operation';

        it(description, function (done) {
            this.testClient = new TestClient(aggregationOperationMapConfig(operation, query, 'cat', 'val'));
            this.testClient.getDataview('cat', { own_filter: 0 }, function (err, aggregation) {
                assert.ifError(err);

                assert.ok(aggregation);
                assert.equal(aggregation.type, 'aggregation');
                assert.ok(aggregation.categories);
                assert.equal(aggregation.categoriesCount, 3);
                assert.equal(aggregation.count, 4);
                assert.equal(aggregation.nulls, 1);

                var hasNullCategory = false;
                aggregation.categories.forEach(function (category) {
                    if (category.category === null) {
                        hasNullCategory = true;
                    }
                });

                if (operation === 'count') {
                    assert.ok(hasNullCategory, 'aggregation has not a category NULL');
                } else {
                    assert.ok(!hasNullCategory, 'aggregation has category NULL');
                }

                done();
            });
        });
    });
});
