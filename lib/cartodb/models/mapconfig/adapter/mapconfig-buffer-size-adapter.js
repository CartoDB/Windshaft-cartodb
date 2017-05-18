function MapConfigBufferSizeAdapter() {
    this.formats = ['png', 'png32', 'mvt', 'grid.json'];
}

module.exports = MapConfigBufferSizeAdapter;

MapConfigBufferSizeAdapter.prototype.getMapConfig = function (user, requestMapConfig, params, context, callback) {
    if (!context.templateParams || !context.templateParams.buffersize) {
        return callback(null, requestMapConfig);
    }

    this.formats.forEach(function (format) {
        if (Number.isFinite(context.templateParams.buffersize[format])) {
            if (requestMapConfig.buffersize === undefined) {
                requestMapConfig.buffersize = {};
            }

            requestMapConfig.buffersize[format] = context.templateParams.buffersize[format];
        }
    });

    setImmediate(function () {
        callback(null, requestMapConfig);
    });
};
