'use strict';

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

module.exports.createAggregationFiltersValidator = function (mapconfig, validParameters) {
    return function validateAggregationFilters (value, key, index) {
        const dims = mapconfig.getAggregation(index).dimensions || {};
        const cols = mapconfig.getAggregation(index).columns || {};
        const validKeys = Object.keys(dims).concat(Object.keys(cols));
        Object.keys(value).forEach((filteredName) => {
            // filteredName  must be the name of either an aggregated column or a dimension in the same layer
            if (!validKeys.includes(filteredName)) {
                const message = `Invalid filtered column: ${filteredName}`;
                throw createLayerError(message, mapconfig, index);
            }
            // The filter parameters must be valid
            let filters = value[filteredName];
            // a single filter or an array of filters (to be OR-combined) are accepted
            if (!Array.isArray(filters)) {
                filters = [filters];
            }
            filters.forEach(params => {
                Object.keys(params).forEach(paramName => {
                    if (!validParameters.includes(paramName)) {
                        const message = `Invalid filter parameter name: ${paramName}`;
                        throw createLayerError(message, mapconfig, index);
                    }
                });
                // TODO: check parameter value (params[paramName]) to be of the correct type
            });
            // TODO: if multiple parameters within params check the combination is valid,
            // i.e. one of the *less* parameters and one of the *greater* parameters.
        });
    };
};

function createAggregationColumnNamesValidator (mapconfig) {
    return function validateAggregationColumnNames (value, key, index) {
        Object.keys(value).forEach((columnName) => {
            if (columnName.length <= 0) {
                const message = 'Invalid column name, should be a non empty string';
                throw createLayerError(message, mapconfig, index);
            }
        });
    };
}

function createAggregateFunctionValidator (mapconfig, validAggregatedFunctions) {
    return function validateAggregateFunction (value, key, index) {
        Object.keys(value).forEach((columnName) => {
            const { aggregate_function: aggregateFunction } = value[columnName];

            if (!validAggregatedFunctions.includes(aggregateFunction)) {
                const message = `Unsupported aggregation function ${aggregateFunction},` +
                                ` valid ones: ${validAggregatedFunctions.join(', ')}`;
                throw createLayerError(message, mapconfig, index);
            }
        });
    };
}

function createAggregatedColumnValidator (mapconfig) {
    return function validateAggregatedColumn (value, key, index) {
        Object.keys(value).forEach((columnName) => {
            const { aggregated_column: aggregatedColumn } = value[columnName];

            if (typeof aggregatedColumn !== 'string' || aggregatedColumn <= 0) {
                const message = 'Invalid aggregated column, should be a non empty string';
                throw createLayerError(message, mapconfig, index);
            }
        });
    };
}

function createLayerError (message, mapconfig, index) {
    const error = new Error(message);
    error.type = 'layer';
    error.layer = {
        id: mapconfig.getLayerId(index),
        index: index,
        type: mapconfig.layerType(index)
    };

    return error;
}
