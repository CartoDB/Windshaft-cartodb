const BaseAggregation = require('./base-aggregation');

module.exports = class VectorAggregation extends BaseAggregation {
    sql (options) {
        return vectorAggregationQueryTemplate({
            sourceQuery: options.sql,
            res: options.resolution,
            columns: options.columns
        });
    }
};

const vectorAggregationQueryTemplate = ctx => `/** aggregated query (vector) **/ ${ctx.sourceQuery}`;
