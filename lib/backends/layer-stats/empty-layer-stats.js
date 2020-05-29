'use strict';

module.exports = class EmptyLayerStats {
    constructor (types = {}) {
        this._types = types;
    }

    is (type) {
        return this._types[type] ? this._types[type] : false;
    }

    getStats (layer, dbConnection, callback) {
        setImmediate(() => callback(null, {}));
    }
};
