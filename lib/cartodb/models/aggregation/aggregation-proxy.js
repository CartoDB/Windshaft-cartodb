const RasterAggregation = require('./raster-aggregation');
const VectorAggregation = require('./vector-aggregation');
const RASTER_AGGREGATION = 'RasterAggregation';
const VECTOR_AGGREGATION = 'VectorAggregation';

module.exports = class AggregationProxy {
    static get THRESHOLD() {
        return 1e5; // 100K
    }

    constructor (mapconfig, query, {
        resolution = 256,
        threshold = AggregationProxy.THRESHOLD,
        placement = 'centroid',
        columns = {}
    } = {}) {
        this.mapconfig = mapconfig;
        this.query = query;
        this.resolution = resolution;
        this.threshold = threshold;
        this.placement = placement;
        this.columns = columns;
        this.implementation = this._getAggregationImplementation();
    }

    _getAggregationImplementation () {
        let implementation = null;

        switch (this._getAggregationType()) {
            case VECTOR_AGGREGATION:
                implementation = new VectorAggregation(
                    this.query,
                    this.resolution,
                    this.threshold,
                    this.placement,
                    this.columns
                );
                break;
            case RASTER_AGGREGATION:
                implementation = new RasterAggregation(
                    this.query,
                    this.resolution,
                    this.threshold,
                    this.placement,
                    this.columns
                );
                break;
            default:
                throw new Error('Unsupported aggregation type');
        }

        return implementation;
    }

    _getAggregationType () {
        if (this.mapconfig.isVectorOnlyMapConfig()) {
            return VECTOR_AGGREGATION;
        }

        return RASTER_AGGREGATION;
    }

    sql () {
        return this.implementation.sql();
    }
};
