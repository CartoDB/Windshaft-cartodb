'use strict';

var queue = require('queue-async');
var turboCarto = require('turbo-carto');
var MapConfig = require('windshaft').model.MapConfig;
var debug = require('debug')('turbo-carto');

function TurboCartoAdapter() {
}

module.exports = TurboCartoAdapter;

TurboCartoAdapter.prototype.getMapConfig = function (user, requestMapConfig, params, context, callback) {
    var datasourceRegistry = context.datasourceRegistry;
    var layers = requestMapConfig.layers;

    if (!layers || layers.length === 0) {
        return callback(null, requestMapConfig);
    }

    var parseCartoQueue = queue(layers.length);

    layers.forEach(function(layer, index) {
        var layerId = MapConfig.getLayerId(requestMapConfig, index);
        parseCartoQueue.defer(_parseCartoCss, datasourceRegistry, layer, index, layerId);
    });

    parseCartoQueue.awaitAll(function (err, results) {
        if (err) {
            return callback(err);
        }

        var errors = results.reduce(function(errors, result) {
            if (result.error) {
                errors.push(result.error);
            }
            return errors;
        }, []);
        if (errors.length > 0) {
            return callback(errors);
        }

        requestMapConfig.layers = results.map(function(result) { return result.layer; });
        context.turboCarto = {
            layers: results.map(function(result) {
                return result.meta;
            })
        };

        return callback(null, requestMapConfig);
    });
};

function _parseCartoCss(datasourceRegistry, layer, layerIndex, layerId, callback) {
    if (!shouldParseLayerCartocss(layer)) {
        return callback(null, { layer: layer });
    }

    var datasource = datasourceRegistry.get(layer.options.source.id);

    turboCarto(layer.options.cartocss, datasource, function processCallback(err, cartocss, meta) {
        debug(err, err&&err.stack);
        // Only return turbo-carto errors
        if (err && err.name === 'TurboCartoError') {
            var error = new Error(err.message);
            error.http_status = 400;
            error.type = 'layer';
            error.subtype = 'turbo-carto';
            error.layer = {
                id: layerId,
                index: layerIndex,
                type: layer.type,
                context: err.context
            };

            return callback(null, { error: error });
        }

        // Try to continue in the rest of the cases
        if (cartocss) {
            layer.options.cartocss = cartocss;
        }
        return callback(null, { layer: layer, meta: meta });
    });
}

function shouldParseLayerCartocss(layer) {
    return layer && layer.options && layer.options.cartocss && (layer.options.sql || layer.options.source);
}
