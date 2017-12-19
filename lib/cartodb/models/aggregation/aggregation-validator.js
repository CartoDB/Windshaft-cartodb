module.exports = function aggregationValidator (mapconfig) {
    return function validateProperty (key, validator) {
        for (let index = 0; index < mapconfig.getLayers().length; index++) {
            const aggregation = mapconfig.getAggregation(index);

            if (aggregation === undefined || aggregation[key] === undefined) {
                continue;
            }

            validator(aggregation[key], key, index);
        }
    };
};

module.exports.createIncludesValueValidator = function (mapconfig, validValues) {
    return function validateIncludesValue (value, key, index) {
        if (!validValues.includes(value)) {
            const message = `Invalid ${key}. Valid values: ${validValues.join(', ')}`;
            throw createLayerError(message, mapconfig, index);
        }
    };
};

module.exports.createPositiveNumberValidator = function (mapconfig) {
    return function validatePositiveNumber (value, key, index) {
        if (!Number.isFinite(value) || value <= 0) {
            const message = `Invalid ${key}, should be a number greather than 0`;
            throw createLayerError(message, mapconfig, index);
        }
    };
};

module.exports.createAggregationColumnsValidator = function (mapconfig, validAggregatedFunctions) {
    const validateAggregationColumnNames = createAggregationColumnNamesValidator(mapconfig);
    const validateAggregateFunction = createAggregateFunctionValidator(mapconfig, validAggregatedFunctions);
    const validateAggregatedColumn = createAggregatedColumnValidator(mapconfig);

    return function validateAggregationColumns (value, key, index) {
        validateAggregationColumnNames(value, key, index);
        validateAggregateFunction(value, key, index);
        validateAggregatedColumn(value, key, index);
    };
};

function createAggregationColumnNamesValidator(mapconfig) {
    return function validateAggregationColumnNames (value, key, index) {
        Object.keys(value).forEach((columnName) => {
            if (columnName.length <= 0) {
                const message = `Invalid column name, should be a non empty string`;
                throw createLayerError(message, mapconfig, index);
            }
        });
    };
}

function createAggregateFunctionValidator (mapconfig, validAggregatedFunctions) {
    return function validateAggregateFunction (value, key, index) {
        Object.keys(value).forEach((columnName) => {
            const { aggregate_function } = value[columnName];

            if (!validAggregatedFunctions.includes(aggregate_function)) {
                const message = `Unsupported aggregation function ${aggregate_function},` +
                                ` valid ones: ${validAggregatedFunctions.join(', ')}`;
                throw createLayerError(message, mapconfig, index);
            }
        });
    };
}

function createAggregatedColumnValidator (mapconfig) {
    return function validateAggregatedColumn (value, key, index) {
        Object.keys(value).forEach((columnName) => {
            const { aggregated_column } = value[columnName];

            if (typeof aggregated_column !== 'string' || aggregated_column <= 0) {
                const message = `Invalid aggregated column, should be a non empty string`;
                throw createLayerError(message, mapconfig, index);
            }
        });
    };
}

function createLayerError(message, mapconfig, index) {
    const error = new Error(message);
    error.type = 'layer';
    error.layer = {
        id: mapconfig.getLayerId(index),
        index: index,
        type: mapconfig.layerType(index)
    };

    return error;
}
