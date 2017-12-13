const MapConfig = require('windshaft').model.MapConfig;
const MISSING_AGGREGATION_COLUMNS = 'Missing columns in the aggregation. The map-config defines cartocss expressions,'+
' interactivity fields or attributes that are not present in the aggregation';


module.exports = class AggregationMapConfig extends MapConfig {
    constructor (config, datasource) {
        super(config, datasource);

        if (this._hasAggregationMissingColumns()) {
            throw new Error(MISSING_AGGREGATION_COLUMNS);
        }
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

    validateAggregation () {
        if (this._hasAggregationMissingColumns()) {
            throw new Error(MISSING_AGGREGATION_COLUMNS);
        }
    }

    _hasAggregationMissingColumns () {
        const layers = this.getLayers();

        if (!this.isAggregationMapConfig()) {
            return false;
        }

        for (let index = 0; index < layers.length; index++) {
            const aggregationColumns = this._getAggregationColumnsByLayer(index);
            const layerColumns = this.getColumnsByLayer(index);

            if (layerColumns.length === 0) {
                continue;
            }

            if (aggregationColumns.length !== layerColumns.length) {
                return true;
            }

            const missingColumns = this._getMissingColumns(aggregationColumns, layerColumns);

            if (missingColumns.length > 0) {
                return true;
            }
        }

        return false;
    }

    _getMissingColumns (aggregationColumns, layerColumns) {
        return aggregationColumns.filter(column => !layerColumns.includes(column));
    }

    _getAggregationColumnsByLayer (index) {
        const { aggregation } = this.getLayer(index).options;
        const hasAggregationColumns = aggregation !== undefined &&
            typeof aggregation !== 'boolean' &&
            typeof aggregation.columns === 'object';

        return hasAggregationColumns ? Object.keys(aggregation.columns) : [];
    }
};
