'use strict';

var queue = require('queue-async');
var SubstitutionTokens = require('../substitution-tokens');

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
    if (!shouldParseLayerCartocss(layer)) {
        return callback(null, layer);
    }

    var sql = SubstitutionTokens.replace(layer.options.sql, {
        bbox: 'ST_MakeEnvelope(-20037508.34,-20037508.34,20037508.34,20037508.34,3857)',
        scale_denominator: '500000001',
        pixel_width: '156412',
        pixel_height: '156412'
    });

    this.turboCartoParser.process(username, layer.options.cartocss, sql, function (err, cartocss) {
        // Only return turbo-carto errors
        if (err && err.name === 'TurboCartoError') {
            err = new Error('turbo-carto: ' + err.message);
            err.http_status = 400;
            return callback(err);
        }

        // Try to continue in the rest of the cases
        if (cartocss) {
            layer.options.cartocss = cartocss;
        }
        return callback(null, layer);
    });
};

function shouldParseLayerCartocss(layer) {
    return layer && layer.options && layer.options.cartocss && layer.options.sql;
}
