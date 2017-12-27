const MapConfig = require('windshaft').model.MapConfig;
const aggregationQuery = require('./aggregation-query');
const aggregationValidator = require('./aggregation-validator');
const {
    createPositiveNumberValidator,
    createIncludesValueValidator,
    createAggregationColumnsValidator
} = aggregationValidator;

module.exports = class AggregationMapConfig extends MapConfig {
    static get AGGREGATIONS () {
        return aggregationQuery.SUPPORTED_AGGREGATE_FUNCTIONS;
    }

    static get PLACEMENTS () {
        return aggregationQuery.SUPPORTED_PLACEMENTS;
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

    constructor (user, config, connection, datasource) {
        super(config, datasource);

        const validate = aggregationValidator(this);
        const positiveNumberValidator = createPositiveNumberValidator(this);
        const includesValidPlacementsValidator = createIncludesValueValidator(this, AggregationMapConfig.PLACEMENTS);
        const aggregationColumnsValidator = createAggregationColumnsValidator(this, AggregationMapConfig.AGGREGATIONS);

        validate('resolution', positiveNumberValidator);
        validate('placement', includesValidPlacementsValidator);
        validate('threshold', positiveNumberValidator);
        validate('columns', aggregationColumnsValidator);

        this.user = user;
        this.pgConnection = connection;
    }

    getAggregatedQuery (index) {
        const { sql_raw, sql } = this.getLayer(index).options;
        const {
            // The default aggregation has no placement, columns or dimensions;
            // this enables the special "full-sample" aggregation.
            resolution = AggregationMapConfig.RESOLUTION,
            threshold = AggregationMapConfig.THRESHOLD,
            placement = null,
            columns = {},
            dimensions = {}
        } = this.getAggregation(index);

        return aggregationQuery({
            query: sql_raw || sql,
            resolution,
            threshold,
            placement,
            columns,
            dimensions
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

    getLayerColumns (index, skipGeoms, callback) {
        const geomColumns = ['the_geom', 'the_geom_webmercator'];
        const limitedQuery = ctx => `SELECT * FROM (${ctx.query}) __cdb_schema LIMIT 0`;
        const layer = this.getLayer(index);

        this.pgConnection.getConnection(this.user, (err, connection) => {
            if (err) {
                return callback(err);
            }

            const sql = limitedQuery({ query: layer.options.sql });

            connection.query(sql, (err, result) => {
                if (err) {
                    return callback(err);
                }

                let columns = result.fields || [];

                columns = columns.map(({ name, type }) => ({ name, type }));

                if (skipGeoms) {
                    columns = columns.filter((column) => !geomColumns.includes(column));
                }

                return callback(err, columns);
            });
        });
    }

    isDefaultAggregation (index) {
        const aggregation = this.getAggregation(index);
        return !aggregation || (
            !aggregation.placement &&
            this._isEmptyParameter(aggregation.columns) &&
            this._isEmptyParameter(aggregation.dimensions)
        );
    }

    _isEmptyParameter (parameter) {
        return !parameter || Object.keys(parameter).length === 0;
    }
};
