const MapConfig = require('windshaft').model.MapConfig;
const aggregationQuery = require('./aggregation-query');
const aggregationValidator = require('./aggregation-validator');
const {
    createNumberValidator,
    createIncludesValueValidator
 } = aggregationValidator;

module.exports = class AggregationMapConfig extends MapConfig {
    static get PLACEMENTS () {
        return [
            'centroid',
            'point-grid',
            'point-sample'
        ];
    }

    static get PLACEMENT () {
        return AggregationMapConfig.PLACEMENTS[0];
    }

    static get THRESHOLD () {
        return 1e5; // 100K
    }

    static get RESOLUTION () {
        return 1;
    }

    static get SUPPORTED_GEOMETRY_TYPES () {
        return [
            'ST_Point'
        ];
    }

    static supportsGeometryType(geometryType) {
        return AggregationMapConfig.SUPPORTED_GEOMETRY_TYPES.includes(geometryType);
    }

    constructor (config, datasource) {
        super(config, datasource);

        const validate = aggregationValidator(this);
        const numberValidator = createNumberValidator(this);
        const includesValidPlacementsValidator = createIncludesValueValidator(this, AggregationMapConfig.PLACEMENTS);

        validate('resolution', numberValidator);
        validate('placement', includesValidPlacementsValidator);
        validate('threshold', numberValidator);
    }

    getAggregatedQuery (index) {
        const { sql_raw, sql } = this.getLayer(index).options;
        const {
            resolution = AggregationMapConfig.RESOLUTION,
            threshold = AggregationMapConfig.THRESHOLD,
            placement = AggregationMapConfig.PLACEMENT,
            columns = {},
            dimmensions = {}
        } = this.getAggregation(index);

        return aggregationQuery({
            query: sql_raw || sql,
            resolution,
            threshold,
            placement,
            columns,
            dimmensions
        });
    }

    isAggregationMapConfig () {
        return this.isVectorOnlyMapConfig() || this.hasAnyLayerAggregation();
    }

    isAggregationLayer (index) {
        return this.isVectorOnlyMapConfig() || this.hasLayerAggregation(index);
    }

    hasAnyLayerAggregation () {
        const layers = this.getLayers();

        for (let index = 0; index < layers.length; index++) {
            if (this.hasLayerAggregation(index)) {
                return true;
            }
        }

        return false;
    }

    hasLayerAggregation (index) {
        const layer = this.getLayer(index);
        const { aggregation } = layer.options;

        return aggregation !== undefined && (typeof aggregation === 'object' || typeof aggregation === 'boolean');
    }

    getAggregation (index) {
        if (!this.hasLayerAggregation(index)) {
            return;
        }

        const { aggregation } = this.getLayer(index).options;

        if (typeof aggregation === 'boolean') {
            return {};
        }

        return aggregation;
    }

    doesLayerReachThreshold(index, featureCount) {
        const threshold = this.getAggregation(index) && this.getAggregation(index).threshold ?
            this.getAggregation(index).threshold :
            AggregationMapConfig.THRESHOLD;

        return featureCount >= threshold;
    }
};
