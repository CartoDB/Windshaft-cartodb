const aggregationQuery = require('./aggregation-query');
const AggregationMapConfig = require('./aggregation-map-config');

module.exports = class Aggregation {
    constructor (mapconfig, query, {
        resolution = 1,
        threshold = AggregationMapConfig.THRESHOLD,
        placement = 'centroid',
        columns = {},
        dimensions = {}
    } = {}) {
        this.mapconfig = mapconfig;
        this.query = query;
        this.resolution = resolution;
        this.threshold = threshold;
        this.placement = placement;
        this.columns = columns;
        this.dimensions = dimensions;
    }
    sql () {
        return aggregationQuery(this);
    }
};
