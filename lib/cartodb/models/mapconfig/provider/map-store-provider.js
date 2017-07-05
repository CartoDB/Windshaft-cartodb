var _ = require('underscore');
var assert = require('assert');
var dot = require('dot');
var step = require('step');

/**
 * @param {MapStore} mapStore
 * @param {String} user
 * @param {UserLimitsApi} userLimitsApi
 * @param {Object} params
 * @constructor
 * @type {MapStoreMapConfigProvider}
 */
function MapStoreMapConfigProvider(mapStore, user, userLimitsApi, params) {
    this.mapStore = mapStore;
    this.user = user;
    this.userLimitsApi = userLimitsApi;
    this.params = params;
    this.token = params.token;
    this.cacheBuster = params.cache_buster || 0;
}

module.exports = MapStoreMapConfigProvider;

MapStoreMapConfigProvider.prototype.getMapConfig = function(callback) {
    var self = this;
    var context = {};
    step(
        function prepareContextLimits() {
            self.userLimitsApi.getRenderLimits(self.user, self.params.api_key, this);
        },
        function handleRenderLimits(err, renderLimits) {
            assert.ifError(err);
            context.limits = renderLimits;
            return null;
        },
        function loadMapConfig(err) {
            assert.ifError(err);
            self.mapStore.load(self.token, this);
        },
        function finish(err, mapConfig) {
            return callback(err, mapConfig, self.params, context);
        }
    );
};

MapStoreMapConfigProvider.prototype.getKey = function() {
    return this.createKey(false);
};

MapStoreMapConfigProvider.prototype.getCacheBuster = function() {
    return this.cacheBuster;
};

MapStoreMapConfigProvider.prototype.filter = function(key) {
    var regex = new RegExp('^' + this.createKey(true) + '.*');
    return key && key.match(regex);
};

// Configure bases for cache keys suitable for string interpolation
var baseKey   = '{{=it.dbname}}:{{=it.token}}';
var rendererKey = baseKey + ':{{=it.dbuser}}:{{=it.format}}:{{=it.layer}}:{{=it.scale_factor}}';

var baseKeyTpl = dot.template(baseKey);
var rendererKeyTpl = dot.template(rendererKey);

MapStoreMapConfigProvider.prototype.createKey = function(base) {
    var tplValues = _.defaults({}, this.params, {
        dbname: '',
        token: '',
        dbuser: '',
        format: '',
        layer: '',
        scale_factor: 1
    });
    return (base) ? baseKeyTpl(tplValues) : rendererKeyTpl(tplValues);
};