var debug = require('debug')('windshaft:datasources');

function DatasourcesMapConfigAdapter() {
}

module.exports = DatasourcesMapConfigAdapter;


DatasourcesMapConfigAdapter.prototype.getMapConfig = function(user, requestMapConfig, params, context, callback) {
    context.filters = getFilters(params);
    debug(context.filters);

    return callback(null, requestMapConfig);
};



function getFilters(params) {
    var filters = {};
    if (params.filters) {
        try {
            filters = JSON.parse(params.filters);
        } catch (e) {
            // ignore
        }
    }
    filters.dataviews = filters.dataviews || {};
    return filters;
}
