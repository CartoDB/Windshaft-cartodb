const aggregationQuery = require('./aggregation-query');

module.exports = class Aggregation {
    static get THRESHOLD() {
        return 1e5; // 100K
    }

    constructor (mapconfig, query, {
        resolution = 1,
        threshold = Aggregation.THRESHOLD,
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
