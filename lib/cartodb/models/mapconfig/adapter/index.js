'use strict';

const MapConfigAdapterProxy = require('./mapconfig-adapter-proxy');

function MapConfigAdapter(adapters) {
    this.adapters = Array.isArray(adapters) ? adapters : Array.apply(null, arguments);
}

module.exports = MapConfigAdapter;

MapConfigAdapter.prototype.getMapConfig = function(user, requestMapConfig, params, context, callback) {
    var self = this;
    var i = 0;
    var tasksLeft = this.adapters.length;
    const mapConfigAdapterProxy = new MapConfigAdapterProxy(user, requestMapConfig, params, context);

    function next(err, mapConfigAdapterProxy) {
        if (err) {
            return callback(err);
        }
        if (tasksLeft-- === 0) {
            return callback(null, mapConfigAdapterProxy.requestMapConfig);
        }
        var nextAdapter = self.adapters[i++];
        nextAdapter.getMapConfig(mapConfigAdapterProxy, next);
    }

    next(null, mapConfigAdapterProxy);
};
