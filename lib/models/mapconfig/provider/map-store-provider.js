'use strict';

const BaseMapConfigProvider = require('./base-mapconfig-adapter');
const dot = require('dot');

// Configure bases for cache keys suitable for string interpolation
const baseKey = '{{=it.dbname}}:{{=it.token}}';
const rendererKey = baseKey + ':{{=it.dbuser}}:{{=it.format}}:{{=it.layer}}:{{=it.scale_factor}}';

const baseKeyTpl = dot.template(baseKey);
const rendererKeyTpl = dot.template(rendererKey);

module.exports = class MapStoreMapConfigProvider extends BaseMapConfigProvider {
    /**
     * @param {MapStore} mapStore
     * @param {String} user
     * @param {UserLimitsBackend} userLimitsBackend
     * @param {Object} params
     * @constructor
     * @type {MapStoreMapConfigProvider}
     */
    constructor (mapStore, user, userLimitsBackend, pgConnection, affectedTablesCache, params) {
        super();
        this.mapStore = mapStore;
        this.user = user;
        this.userLimitsBackend = userLimitsBackend;
        this.pgConnection = pgConnection;
        this.affectedTablesCache = affectedTablesCache;
        this.params = params;
        this.token = params.token;
        this.cacheBuster = params.cache_buster || 0;
        this.mapConfig = null;
        this.context = null;
    }

    getMapConfig (callback) {
        if (this.mapConfig !== null) {
            return callback(null, this.mapConfig, this.params, this.context);
        }

        const context = {};

        this.userLimitsBackend.getRenderLimits(this.user, this.params.api_key, (err, renderLimits) => {
            if (err) {
                return callback(err);
            }

            context.limits = renderLimits;

            this.mapStore.load(this.token, (err, mapConfig) => {
                if (err) {
                    return callback(err);
                }

                this.mapConfig = mapConfig;
                this.context = context;

                return callback(null, mapConfig, this.params, context);
            });
        });
    }

    getKey () {
        return this.createKey(false);
    }

    getCacheBuster () {
        return this.cacheBuster;
    }

    filter (key) {
        const regex = new RegExp('^' + this.createKey(true) + '.*');
        return key && key.match(regex);
    }

    createKey (base) {
        const { dbname = '', token = '', dbuser = '', format = '', layer = '', scale_factor = 1 } = this.params;
        const tplValues = { dbname, token, dbuser, format, layer, scale_factor };

        return (base) ? baseKeyTpl(tplValues) : rendererKeyTpl(tplValues);
    }
};
