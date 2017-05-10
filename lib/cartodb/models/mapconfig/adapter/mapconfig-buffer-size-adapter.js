function MapConfigBufferSizeAdapter() {
}

module.exports = MapConfigBufferSizeAdapter;

var formats = ['png', 'png32', 'mvt', 'grid.json', 'geojson'];

MapConfigBufferSizeAdapter.prototype.getMapConfig = function (user, requestMapConfig, params, context, callback) {
    if (!context.templateParams || !context.templateParams.buffersize) {
        return callback(null, requestMapConfig);
    }

    formats.forEach(function (format) {
        if (Number.isFinite(context.templateParams.buffersize[format])) {
            requestMapConfig.buffersize[format] = context.templateParams.buffersize[format];
        }
    });

    process.nextTick(function () {
        callback(null, requestMapConfig);
    });
};
