'use strict';

module.exports = class MapConfigAdapterProxy {
    constructor (user, requestMapConfig, params, context) {
        this.user = user;
        this.requestMapConfig = requestMapConfig;
        this.params = params;
        this.context = context;
    }
};
