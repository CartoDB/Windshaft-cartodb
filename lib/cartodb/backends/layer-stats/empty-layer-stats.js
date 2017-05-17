function EmptyLayerStats(types) {
    this._types = types || {};
}

EmptyLayerStats.prototype.is = function (type) {
    return this._types[type] ? this._types[type] : false;
};

EmptyLayerStats.prototype.getStats =
function (layer, dbConnection, callback) {
    process.nextTick(function() {
        callback(null, {});
    });
};

module.exports = EmptyLayerStats;
