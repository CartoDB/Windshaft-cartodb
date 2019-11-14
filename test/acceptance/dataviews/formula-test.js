'use strict';

require('../../support/test-helper');
var assert = require('../../support/assert');
var TestClient = require('../../support/test-client');

function createMapConfig (layers, dataviews, analysis) {
    return {
        version: '1.5.0',
        layers: layers,
        dataviews: dataviews || {},
        analyses: analysis || []
    };
}

function getMapConfig (operation, lastNumber) {
    return createMapConfig([
        {
            type: 'cartodb',
            options: {
                source: {
                    id: 'a0'
                },
                cartocss: '#points { marker-width: 10; marker-fill: red; }',
                cartocss_version: '2.3.0'
            }
        }
    ],
    {
        val_formula: {
            source: {
                id: 'a0'
            },
            type: 'formula',
            options: {
                column: 'val',
                operation: operation
            }
        }
    },
    [
        {
            id: 'a0',
            type: 'source',
            params: {
                query: `
                    SELECT
                        null::geometry the_geom_webmercator,
                        CASE
                            WHEN x % 5 = 1 THEN 'infinity'::float
                            WHEN x % 5 = 2 THEN '-infinity'::float
                            WHEN x % 5 = 3 THEN 'NaN'::float
                            WHEN x % 5 = 4 THEN NULL
                            ELSE x
                        END AS val
                    FROM generate_series(1, ${lastNumber}) x
                `
            }
        }
    ]);
}

describe('formula-dataview: special float values', function () {
    describe('easy numbers', function () { // not needed, but I keep it here to help human calc
        afterEach(function (done) {
            if (this.testClient) {
                this.testClient.drain(done);
            } else {
                done();
            }
        });

        const lastNumber = 10;

        [
            { operation: 'count', result: 2 },
            { operation: 'avg', result: 7.5 },
            { operation: 'sum', result: 15 },
            { operation: 'min', result: 5 },
            { operation: 'max', result: 10 }
        ]
            .forEach(operationData => {
                it(operationData.operation, function (done) {
                    this.testClient = new TestClient(getMapConfig(operationData.operation, lastNumber), 1234);
                    this.testClient.getDataview('val_formula', {}, function (err, dataview) {
                        assert.ok(!err, err);
                        assert.deepStrictEqual(dataview, {
                            type: 'formula',
                            operation: operationData.operation,
                            result: operationData.result,
                            nulls: lastNumber / 5,
                            nans: lastNumber / 5,
                            infinities: 2 * lastNumber / 5
                        });
                        done();
                    });
                });
            });
    });

    describe('bigger numbers', function () {
        afterEach(function (done) {
            if (this.testClient) {
                this.testClient.drain(done);
            } else {
                done();
            }
        });

        const lastNumber = 1000;

        [
            { operation: 'count', result: 200 },
            { operation: 'avg', result: 502.5 },
            { operation: 'sum', result: 100500 },
            { operation: 'min', result: 5 },
            { operation: 'max', result: 1000 }
        ]
            .forEach(operationData => {
                it(operationData.operation, function (done) {
                    this.testClient = new TestClient(getMapConfig(operationData.operation, lastNumber), 1234);
                    this.testClient.getDataview('val_formula', {}, function (err, dataview) {
                        assert.ok(!err, err);
                        assert.deepStrictEqual(dataview, {
                            type: 'formula',
                            operation: operationData.operation,
                            result: operationData.result,
                            nulls: lastNumber / 5,
                            nans: lastNumber / 5,
                            infinities: 2 * lastNumber / 5
                        });
                        done();
                    });
                });
            });
    });
});
