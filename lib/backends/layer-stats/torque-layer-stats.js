'use strict';

module.exports = class TorqueLayerStats {
    constructor () {
        this._types = {
            torque: true
        };
    }

    is (type) {
        return this._types[type] ? this._types[type] : false;
    }

    getStats (layer, dbConnection, callback) {
        return callback(null, {});
    }
};
