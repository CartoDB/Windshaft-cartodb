'use strict';

function MapConfigAdapter (adapters) {
    this.adapters = Array.isArray(adapters) ? adapters : Array.apply(null, arguments);
}

module.exports = MapConfigAdapter;

MapConfigAdapter.prototype.getMapConfig = function (user, requestMapConfig, params, context, callback) {
    var self = this;
    var i = 0;
    var tasksLeft = this.adapters.length;

    let mapConfigStats = {};

    function next (err, _requestMapConfig, adapterStats = {}) {
        if (err) {
            return callback(err);
        }

        mapConfigStats = Object.assign(mapConfigStats, adapterStats);

        if (tasksLeft-- === 0) {
            return callback(null, _requestMapConfig, mapConfigStats);
        }
        var nextAdapter = self.adapters[i++];
        nextAdapter.getMapConfig(user, _requestMapConfig, params, context, next);
    }

    next(null, requestMapConfig, mapConfigStats);
};
