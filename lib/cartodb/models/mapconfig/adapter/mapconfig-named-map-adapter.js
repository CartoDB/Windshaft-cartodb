var _ = require('underscore');

function MapConfigNamedMapAdapter() {
}

module.exports = MapConfigNamedMapAdapter;

MapConfigNamedMapAdapter.prototype.getMapConfig = function (user, requestMapConfig, params, context, callback) {
    if (context.templateParams && 
            context.templateParams.buffersize && 
            isValidBufferSize(context.templateParams.buffersize)) {
        requestMapConfig.buffersize = context.templateParams.buffersize;
    }

    process.nextTick(function () {
        callback(null, requestMapConfig);
    });
};

function isValidBufferSize (bufferSize) {
    var formats = ['png', 'png32', 'mvt', 'grid.json', 'geojson'];

    if (!_.isObject(bufferSize) || (_.isArray(bufferSize) || _.isFunction(bufferSize))) {
        return false;
    }

    for (var index = 0; index < formats.length; index++) {
        var bufferSizeByFormat = bufferSize[formats[index]];
        if (bufferSizeByFormat && !Number.isFinite(bufferSizeByFormat)) {
            return false;
        }
    }

    return true;
}
