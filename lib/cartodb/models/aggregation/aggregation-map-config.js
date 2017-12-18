const MapConfig = require('windshaft').model.MapConfig;
const Aggregation = require('./aggregation');

module.exports = class AggregationMapConfig extends MapConfig {
    constructor (config, datasource) {
        super(config, datasource);

        this.validate();
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

    validate () {
        const validator = aggregationValidator(this);

        validator('resolution', createNumberValidator(this));
        validator('placement', createIncludesValueValidator(this, Aggregation.PLACEMENTS));
        validator('threshold', createNumberValidator(this));
    }
};

function aggregationValidator (mapconfig) {
    return function validateProperty (prop, validator) {
        for (let index = 0; index < mapconfig.getLayers().length; index++) {
            const aggregation = mapconfig.getAggregation(index);

            if (aggregation === undefined || aggregation[prop] === undefined) {
                continue;
            }

            validator(aggregation[prop], prop, index);
        }
    };
}

function createIncludesValueValidator(mapconfig, validValues) {
    return function validateIncludesValue (prop, key, index) {
        if (!validValues.includes(prop)) {
            const error = new Error(`Invalid ${key}. Valid values: ${validValues.join(', ')}`);
            error.type = 'layer';
            error.layer = {
                id: mapconfig.getLayerId(index),
                index: index,
                type: mapconfig.layerType(index)
            };

            throw error;
        }
    };
}

function createNumberValidator(mapconfig) {
    return function validateNumber (prop, key, index) {
        if (!Number.isFinite(prop) || prop <= 0)  {
            const error = new Error(`Invalid ${key}, should be a number greather than 0`);
            error.type = 'layer';
            error.layer = {
                id: mapconfig.getLayerId(index),
                index: index,
                type: mapconfig.layerType(index)
            };

            throw error;
        }
    };
}
