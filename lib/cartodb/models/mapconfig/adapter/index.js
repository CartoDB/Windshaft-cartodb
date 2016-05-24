'use strict';

function MapConfigAdapter(adapters) {
    this.adapters = adapters;
}

module.exports = MapConfigAdapter;

MapConfigAdapter.prototype.getMapConfig = function(user, requestMapConfig, params, context, callback) {
    var self = this;
    var i = 0;
    var tasksLeft = this.adapters.length;

    function next(err, _requestMapConfig) {
        if (err) {
            return callback(err);
        }
        if (tasksLeft-- === 0) {
            return callback(null, _requestMapConfig);
        }
        var nextAdapter = self.adapters[i++];
        nextAdapter.getMapConfig(user, _requestMapConfig, params, context, next);
    }

    next(null, requestMapConfig);
};
