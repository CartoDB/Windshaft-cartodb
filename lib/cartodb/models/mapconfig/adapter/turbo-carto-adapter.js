'use strict';

var dot = require('dot');
dot.templateSettings.strip = false;
var queue = require('queue-async');
var PSQL = require('cartodb-psql');
var turboCarto = require('turbo-carto');

var SubstitutionTokens = require('../../../utils/substitution-tokens');
var PostgresDatasource = require('../../../backends/turbo-carto-postgres-datasource');

function TurboCartoAdapter() {
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
        parseCartoQueue.defer(self._parseCartoCss.bind(self), user, params, layer, index);
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


TurboCartoAdapter.prototype._parseCartoCss = function (username, params, layer, index, callback) {
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

    var pg = new PSQL(dbParamsFromReqParams(params));

    this.process(pg, layer.options.cartocss, sql, function (err, cartocss) {
        // Only return turbo-carto errors
        if (err && err.name === 'TurboCartoError') {
            var error = new Error('turbo-carto: ' + err.message);
            error.http_status = 400;
            error.type = 'turbo-carto';
            error.context = err.context;
            error.context.layer = {
                index: index,
                type: layer.type
            };

            return callback(error);
        }

        // Try to continue in the rest of the cases
        if (cartocss) {
            layer.options.cartocss = cartocss;
        }
        return callback(null, layer);
    });
};

TurboCartoAdapter.prototype.process = function (psql, cartocss, sql, callback) {
    var datasource = new PostgresDatasource(psql, sql);
    turboCarto(cartocss, datasource, callback);
};

function shouldParseLayerCartocss(layer) {
    return layer && layer.options && layer.options.cartocss && layer.options.sql;
}

function dbParamsFromReqParams(params) {
    var dbParams = {};
    if ( params.dbuser ) {
        dbParams.user = params.dbuser;
    }
    if ( params.dbpassword ) {
        dbParams.pass = params.dbpassword;
    }
    if ( params.dbhost ) {
        dbParams.host = params.dbhost;
    }
    if ( params.dbport ) {
        dbParams.port = params.dbport;
    }
    if ( params.dbname ) {
        dbParams.dbname = params.dbname;
    }
    return dbParams;
}
