const aggregationQuery = require('./aggregation-query');

module.exports = class Aggregation {
    static get THRESHOLD() {
        return 1e5; // 100K
    }

    constructor (mapconfig, query, {
        resolution = 256,
        threshold = Aggregation.THRESHOLD,
        placement = 'centroid',
        columns = {}
    } = {}) {
        this.mapconfig = mapconfig;
        this.query = query;
        this.resolution = resolution;
        this.threshold = threshold;
        this.placement = placement;
        this.columns = columns;
    }
    sql () {
        return aggregationQuery(this);
    }
};
