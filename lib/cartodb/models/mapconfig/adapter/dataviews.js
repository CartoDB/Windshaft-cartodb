'use strict';

function DataviewsMapConfigAdapter() {
}

module.exports = DataviewsMapConfigAdapter;

DataviewsMapConfigAdapter.prototype.getMapConfig = function(user, requestMapConfig, params, context, callback) {
    var dataviews = requestMapConfig.dataviews || {};
    var errors = getDataviewsErrors(dataviews);
    if (errors.length > 0) {
        return callback(errors);
    }
    requestMapConfig.dataviews = dataviews;
    return callback(null, requestMapConfig);
};

function getDataviewsErrors(dataviews) {
    var dataviewType = typeof dataviews;
    if (dataviewType !== 'object') {
        return [new Error('"dataviews" must be a valid JSON object: "' + dataviewType + '" type found')];
    }

    if (Array.isArray(dataviews)) {
        return [new Error('"dataviews" must be a valid JSON object: "array" type found')];
    }

    var errors = [];

    Object.keys(dataviews).forEach(function(dataviewName) {
        var dataview = dataviews[dataviewName];
        if (!dataview.hasOwnProperty('source') || !dataview.source.id) {
            errors.push(new Error('Dataview "' + dataviewName + '" is missing `source.id` attribute'));
        }

        if (!dataview.type) {
            errors.push(new Error('Dataview "' + dataviewName + '" is missing `type` attribute'));
        }
    });

    return errors;
}
