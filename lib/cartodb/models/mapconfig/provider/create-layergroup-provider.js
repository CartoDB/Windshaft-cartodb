'use strict';

const MapStoreMapConfigProvider = require('./map-store-provider');

module.exports = class CreateLayergroupMapConfigProvider extends MapStoreMapConfigProvider {
    constructor (mapConfig, user, userLimitsBackend, pgConnection, affectedTablesCache, params) {
        super(null, user, userLimitsBackend, pgConnection, affectedTablesCache, params);
        this.mapConfig = mapConfig;
    }

    getMapConfig (callback) {
        if (this.mapConfig && this.params && this.context) {
            return callback(null, this.mapConfig, this.params, this.context);
        }

        const context = {};

        this.userLimitsBackend.getRenderLimits(this.user, this.params.api_key, (err, renderLimits) => {
            if (err) {
                return callback(err);
            }

            context.limits = renderLimits;
            this.context = context;

            return callback(null, this.mapConfig, this.params, context);
        });
    }
};
