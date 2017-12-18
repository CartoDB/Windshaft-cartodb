module.exports = function aggregationValidator (mapconfig) {
    return function validateProperty (prop, validator) {
        for (let index = 0; index < mapconfig.getLayers().length; index++) {
            const aggregation = mapconfig.getAggregation(index);

            if (aggregation === undefined || aggregation[prop] === undefined) {
                continue;
            }

            validator(aggregation[prop], prop, index);
        }
    };
};

module.exports.createIncludesValueValidator = function (mapconfig, validValues) {
    return function validateIncludesValue (value, key, index) {
        if (!validValues.includes(value)) {
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
};

module.exports.createPositiveNumberValidator = function (mapconfig) {
    return function validatePositiveNumber (value, key, index) {
        if (!Number.isFinite(value) || value <= 0) {
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
};

module.exports.createAggregationColumnsValidator = function (mapconfig, validAggregatedFunctions) {
    return function validateAggregationColumns (value, key, index) {
        Object.keys(value).forEach((columnName) => {
            if (columnName.length <= 0) {
                const error = new Error(`Invalid column name, should be a non empty string`);
                error.type = 'layer';
                error.layer = {
                    id: mapconfig.getLayerId(index),
                    index: index,
                    type: mapconfig.layerType(index)
                };

                throw error;
            }

            const { aggregate_function } = value[columnName];

            if (!validAggregatedFunctions.includes(aggregate_function)) {
                const error = new Error(
                    `Unsupported aggregation function ${aggregate_function},` +
                    ` valid ones: ${validAggregatedFunctions.join(', ')}`
                );
                error.type = 'layer';
                error.layer = {
                    id: mapconfig.getLayerId(index),
                    index: index,
                    type: mapconfig.layerType(index)
                };

                throw error;
            }

            const { aggregated_column } = value[columnName];

            if (typeof aggregated_column !== 'string' || aggregated_column <= 0) {
                const error = new Error(
                    `Invalid aggregated column, should be a non empty string`
                );
                error.type = 'layer';
                error.layer = {
                    id: mapconfig.getLayerId(index),
                    index: index,
                    type: mapconfig.layerType(index)
                };

                throw error;
            }
        });
    };
};
