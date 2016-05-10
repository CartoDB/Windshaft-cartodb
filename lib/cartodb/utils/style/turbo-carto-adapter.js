'use strict';

var queue = require('queue-async');

function TurboCartoAdapter(turboCartoParser) {
    this.turboCartoParser = turboCartoParser;
}

module.exports = TurboCartoAdapter;

TurboCartoAdapter.prototype.getLayers = function (username, layers, callback) {
    var self = this;

    if (!layers || layers.length === 0) {
        return callback(null, layers);
    }

    var parseCartoQueue = queue(layers.length);

    layers.forEach(function(layer) {
        parseCartoQueue.defer(self._parseCartoCss.bind(self), username, layer);
    });

    parseCartoQueue.awaitAll(function (err, layers) {
        if (err) {
            return callback(err);
        }

        return callback(null, layers);
    });
};

TurboCartoAdapter.prototype._parseCartoCss = function (username, layer, callback) {
    if (isNotLayerToParseCartocss(layer)) {
        return process.nextTick(function () {
            callback(null, layer);
        });
    }

    this.turboCartoParser.process(username, layer.options.cartocss, layer.options.sql, function (err, cartocss) {
        // Ignore turbo-carto errors and continue
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
