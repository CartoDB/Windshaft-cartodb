const BaseAggregation = require('./base-aggregation');

module.exports = class RasterAggregation extends BaseAggregation {
    sql (options) {
        return rasterAggregationQueryTemplate({
            sourceQuery: options.sql,
            res: options.resolution,
            columns: options.columns
        });
    }
};

const rasterAggregationQueryTemplate = ctx => `/** aggregated query (raster) **/ ${ctx.sourceQuery}`;
