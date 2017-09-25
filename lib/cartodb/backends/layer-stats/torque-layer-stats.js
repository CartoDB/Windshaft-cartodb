function TorqueLayerStats() {
    this._types = {
        torque: true
    };
}

TorqueLayerStats.prototype.is = function (type) {
    return this._types[type] ? this._types[type] : false;
};

TorqueLayerStats.prototype.getStats =
function (layer, dbConnection, callback) {
    return callback(null, {});
};

module.exports = TorqueLayerStats;
