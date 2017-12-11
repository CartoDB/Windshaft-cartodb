module.exports = class BaseAggregation {
    constructor(query, resolution, threshold, placement, columns) {
        this.query = query;
        this.resolution = resolution;
        this.threshold = threshold;
        this.placement = placement;
        this.columns = columns;
    }
    sql () {
        throw new Error('Unimplemented method');
    }
};
