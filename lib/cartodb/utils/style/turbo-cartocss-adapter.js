'use strict';

var queue = require('queue-async');

function TurboCartocssAdapter(turboCartocssParser) {
    this.turboCartocssParser = turboCartocssParser;
}

module.exports = TurboCartocssAdapter;

TurboCartocssAdapter.prototype.getLayers = function (username, layers, callback) {
    var self = this;

    if (!layers || layers.length === 0) {
        return callback(null, layers);
    }

    var parseCartoCssQueue = queue(layers.length);

    layers.forEach(function(layer) {
        parseCartoCssQueue.defer(self._parseCartoCss.bind(self), username, layer);
    });

    parseCartoCssQueue.awaitAll(function (err, layers) {
        if (err) {
            return callback(err);
        }

        return callback(null, layers);
    });
};

TurboCartocssAdapter.prototype._parseCartoCss = function (username, layer, callback) {
    if (isNotLayerToParseCartocss(layer)) {
        return process.nextTick(function () {
            callback(null, layer);
        });
    }

    this.turboCartocssParser.process(username, layer.options.cartocss, layer.options.sql, function (err, cartocss) {
        // Ignore turbo-cartocss errors and continue
        if (!err && cartocss) {
            layer.options.cartocss = cartocss;
        }

        callback(null, layer);
    });
};

function isNotLayerToParseCartocss(layer) {
    if (!layer || !layer.options || !layer.options.cartocss || !layer.options.sql) {
        return true;
    }

    return false;
}
