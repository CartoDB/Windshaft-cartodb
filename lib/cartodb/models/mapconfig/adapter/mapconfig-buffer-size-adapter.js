function MapConfigBufferSizeAdapter() {
    this.formats = ['png', 'png32', 'mvt', 'grid.json'];
}

module.exports = MapConfigBufferSizeAdapter;

MapConfigBufferSizeAdapter.prototype.getMapConfig = function (mapConfigAdapterProxy, callback) {
    const { requestMapConfig, context } = mapConfigAdapterProxy;

    if (!context.templateParams || !context.templateParams.buffersize) {
        return callback(null, mapConfigAdapterProxy);
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
        callback(null, mapConfigAdapterProxy);
    });
};
