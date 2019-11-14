'use strict';

module.exports = function mapError (options) {
    const { addContext = false, label = 'MAPS CONTROLLER' } = options;

    return function mapErrorMiddleware (err, req, res, next) {
        req.profiler.done('error');
        const { mapConfig } = res.locals;

        if (addContext) {
            err = Number.isFinite(err.layerIndex) ? populateError(err, mapConfig) : err;
        }

        err.label = label;

        next(err);
    };
};

function populateError (err, mapConfig) {
    var error = new Error(err.message);
    error.http_status = err.http_status;

    if (!err.http_status && err.message.indexOf('column "the_geom_webmercator" does not exist') >= 0) {
        error.http_status = 400;
    }

    error.type = 'layer';
    error.subtype = err.message.indexOf('Postgis Plugin') >= 0 ? 'query' : undefined;
    error.layer = {
        id: mapConfig.getLayerId(err.layerIndex),
        index: err.layerIndex,
        type: mapConfig.layerType(err.layerIndex)
    };

    return error;
}
