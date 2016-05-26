function DataviewsWidgetsMapConfigAdapter() {
}

module.exports = DataviewsWidgetsMapConfigAdapter;


DataviewsWidgetsMapConfigAdapter.prototype.getMapConfig = function(user, requestMapConfig, params, context, callback) {
    return callback(null, requestMapConfig);
};
