const MapConfig = require('windshaft').model.MapConfig;

module.exports = class AggregationMapConfig extends MapConfig {
    static get THRESHOLD () {
        return 1e5; // 100K
    }

    static get PLACEMENTS () {
        return [
            'centroid',
            'point-grid',
            'point-sample'
        ];
    }

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
        const validate = aggregationValidator(this);
        const numberValidator = createNumberValidator(this);
        const includesValidPlacementsValidator = createIncludesValueValidator(this, AggregationMapConfig.PLACEMENTS);

        validate('resolution', numberValidator);
        validate('placement', includesValidPlacementsValidator);
        validate('threshold', numberValidator);
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
