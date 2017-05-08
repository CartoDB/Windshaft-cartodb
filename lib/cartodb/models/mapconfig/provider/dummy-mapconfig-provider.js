var util = require('util');
var MapStoreMapConfigProvider = require('windshaft').model.provider.MapStoreMapConfig;

function DummyMapConfigProvider(mapConfig, params) {
    MapStoreMapConfigProvider.call(this, undefined, params);

    this.mapConfig = mapConfig;
}

util.inherits(DummyMapConfigProvider, MapStoreMapConfigProvider);

module.exports = DummyMapConfigProvider;

DummyMapConfigProvider.prototype.setParams = function(params) {
    this.params = params;
};

DummyMapConfigProvider.prototype.getMapConfig = function(callback) {
    return callback(null, this.mapConfig, this.params, {});
};
