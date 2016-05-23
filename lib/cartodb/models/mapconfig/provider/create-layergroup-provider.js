var assert = require('assert');
var step = require('step');

var MapStoreMapConfigProvider = require('./../map_store_provider');

/**
 * @param {MapConfig} mapConfig
 * @param {String} user
 * @param {UserLimitsApi} userLimitsApi
 * @param {Object} params
 * @constructor
 * @type {CreateLayergroupMapConfigProvider}
 */
function CreateLayergroupMapConfigProvider(mapConfig, user, userLimitsApi, params) {
    this.mapConfig = mapConfig;
    this.user = user;
    this.userLimitsApi = userLimitsApi;
    this.params = params;
    this.cacheBuster = params.cache_buster || 0;
}

module.exports = CreateLayergroupMapConfigProvider;

CreateLayergroupMapConfigProvider.prototype.getMapConfig = function(callback) {
    var self = this;
    var context = {};
    step(
        function prepareContextLimits() {
            self.userLimitsApi.getRenderLimits(self.user, this);
        },
        function handleRenderLimits(err, renderLimits) {
            assert.ifError(err);
            context.limits = renderLimits;
            return null;
        },
        function finish(err) {
            return callback(err, self.mapConfig, self.params, context);
        }
    );
};

CreateLayergroupMapConfigProvider.prototype.getKey = MapStoreMapConfigProvider.prototype.getKey;

CreateLayergroupMapConfigProvider.prototype.getCacheBuster = MapStoreMapConfigProvider.prototype.getCacheBuster;

CreateLayergroupMapConfigProvider.prototype.filter = MapStoreMapConfigProvider.prototype.filter;

CreateLayergroupMapConfigProvider.prototype.createKey = MapStoreMapConfigProvider.prototype.createKey;
