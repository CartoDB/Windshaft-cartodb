'use strict';

var dot = require('dot');
dot.templateSettings.strip = false;
var queue = require('queue-async');
var SubstitutionTokens = require('../../../utils/substitution-tokens');

function TurboCartoAdapter(turboCartoParser) {
    this.turboCartoParser = turboCartoParser;
}

module.exports = TurboCartoAdapter;

TurboCartoAdapter.prototype.getMapConfig = function (user, requestMapConfig, params, context, callback) {
    var self = this;

    var layers = requestMapConfig.layers;

    if (!layers || layers.length === 0) {
        return callback(null, requestMapConfig);
    }

    var parseCartoQueue = queue(layers.length);

    layers.forEach(function(layer, index) {
        parseCartoQueue.defer(self._parseCartoCss.bind(self), user, layer, index);
    });

    parseCartoQueue.awaitAll(function (err, layers) {
        if (err) {
            return callback(err);
        }

        requestMapConfig.layers = layers;

        return callback(null, requestMapConfig);
    });
};

var bboxTemplate = dot.template('(select ST_SetSRID(st_extent(the_geom_webmercator), 3857) from ({{=it._sql}}) __c)');
var zoomTemplate = dot.template([
    'GREATEST(',
    'ceil(log(40075017000 / 256 / GREATEST(',
    '  st_xmax({{=it._bbox}}) - st_xmin({{=it._bbox}}),',
    '  st_ymax({{=it._bbox}}) - st_ymin({{=it._bbox}})',
    '))/log(2)),',
    '0',
    ')'
].join('\n'));
var pixelSizeTemplate = dot.template('40075017 * cos(ST_Y(ST_Centroid({{=it._bbox}}))) / 2 ^ (({{=it._zoom}}) + 8)');
var scaleDenominatorTemplate = dot.template('({{=it._pixelSize}} / 0.00028)::numeric');


TurboCartoAdapter.prototype._parseCartoCss = function (username, layer, index, callback) {
    if (!shouldParseLayerCartocss(layer)) {
        return callback(null, layer);
    }

    var tokens = {
        bbox: 'ST_MakeEnvelope(-20037508.34,-20037508.34,20037508.34,20037508.34,3857)',
        scale_denominator: '500000001',
        pixel_width: '156412',
        pixel_height: '156412'
    };

    var layerSql = layer.options.sql;
    var layerRawSql = layer.options.sql_raw;
    if (SubstitutionTokens.hasTokens(layerSql) && layerRawSql) {
        var bbox = bboxTemplate({ _sql: layerRawSql });
        var zoom = zoomTemplate({ _bbox: bbox });
        var pixelSize = pixelSizeTemplate({ _bbox: bbox, _zoom: zoom });
        var scaleDenominator = scaleDenominatorTemplate({ _pixelSize: pixelSize });

        tokens = {
            bbox: bbox,
            scale_denominator: scaleDenominator,
            pixel_width: pixelSize,
            pixel_height: pixelSize
        };
    }

    var sql = SubstitutionTokens.replace(layerSql, tokens);

    this.turboCartoParser.process(username, layer.options.cartocss, sql, function (err, cartocss) {
        // Only return turbo-carto errors
        if (err && err.name === 'TurboCartoError') {
            err = new Error('turbo-carto: ' + err.message);
            err.http_status = 400;
            err.context = {
                type: 'turbo-carto',
                layer: {
                    index: index,
                    type: layer.type
                }
            };
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
