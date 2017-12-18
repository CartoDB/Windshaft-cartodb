const MapConfig = require('windshaft').model.MapConfig;
const Aggregation = require('./aggregation');

module.exports = class AggregationMapConfig extends MapConfig {
    constructor (config, datasource) {
        super(config, datasource);

        this.validateResolution();
        this.validatePlacement();
        this.validateThreshold();
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

    validateResolution () {
        for (let index = 0; index < this.getLayers().length; index++) {
            const aggregation = this.getAggregation(index);

            if (aggregation === undefined || aggregation.resolution === undefined) {
                continue;
            }

            const resolution = parseInt(aggregation.resolution, 10);

            if (!Number.isFinite(resolution) || resolution <= 0)  {
                const error = new Error(`Invalid resolution, should be a number greather than 0`);
                error.type = 'layer';
                error.layer = {
                    id: this.getLayerId(index),
                    index: index,
                    type: this.layerType(index)
                };

                throw error;
            }
        }
    }

    validatePlacement () {
        for (let index = 0; index < this.getLayers().length; index++) {
            const aggregation = this.getAggregation(index);

            if (aggregation === undefined || aggregation.placement === undefined) {
                continue;
            }

            if (!Aggregation.PLACEMENTS.includes(aggregation.placement)) {
                const error = new Error(`Invalid placement. Valid values: ${Aggregation.PLACEMENTS.join(', ')}`);
                error.type = 'layer';
                error.layer = {
                    id: this.getLayerId(index),
                    index: index,
                    type: this.layerType(index)
                };

                throw error;
            }
        }
    }

    validateThreshold () {
        for (let index = 0; index < this.getLayers().length; index++) {
            const aggregation = this.getAggregation(index);

            if (aggregation === undefined || aggregation.threshold === undefined) {
                continue;
            }

            const threshold = parseInt(aggregation.threshold, 10);

            if (!Number.isFinite(threshold) || threshold <= 0)  {
                const error = new Error(`Invalid threshold, should be a number greather than 0`);
                error.type = 'layer';
                error.layer = {
                    id: this.getLayerId(index),
                    index: index,
                    type: this.layerType(index)
                };

                throw error;
            }
        }
    }
};
