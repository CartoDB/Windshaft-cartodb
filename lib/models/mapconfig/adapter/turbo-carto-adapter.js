'use strict';

var dot = require('dot');
dot.templateSettings.strip = false;
var queue = require('queue-async');
var PSQL = require('cartodb-psql');
var turboCarto = require('turbo-carto');

const SubstitutionTokens = require('cartodb-query-tables').utils.substitutionTokens;
var PostgresDatasource = require('../../../backends/turbo-carto-postgres-datasource');

var MapConfig = require('windshaft').model.MapConfig;

const dbParamsFromReqParams = require('../../../utils/database-params');

function TurboCartoAdapter () {
}

module.exports = TurboCartoAdapter;

TurboCartoAdapter.prototype.getMapConfig = function (user, requestMapConfig, params, context, callback) {
    var self = this;

    var layers = requestMapConfig.layers;

    if (!layers || layers.length === 0) {
        return callback(null, requestMapConfig);
    }

    var parseCartoQueue = queue(layers.length);

    layers.forEach(function (layer, index) {
        var layerId = MapConfig.getLayerId(requestMapConfig, index);
        parseCartoQueue.defer(self._parseCartoCss.bind(self), user, params, layer, index, layerId);
    });

    parseCartoQueue.awaitAll(function (err, results) {
        if (err) {
            return callback(err);
        }

        var errors = results.reduce(function (errors, result) {
            if (result.error) {
                errors.push(result.error);
            }
            return errors;
        }, []);
        if (errors.length > 0) {
            return callback(errors);
        }

        requestMapConfig.layers = results.map(function (result) { return result.layer; });
        context.turboCarto = {
            layers: results.map(function (result) {
                return result.meta;
            })
        };

        return callback(null, requestMapConfig);
    });
};

var tokensQueryTpl = dot.template([
    'WITH input_query AS (',
    '  {{=it._sql}}',
    '),',
    'bbox_query AS (',
    '  SELECT ST_SetSRID(ST_Extent(the_geom_webmercator), 3857) as bbox from input_query',
    '),',
    'zoom_query as (',
    '  SELECT GREATEST(',
    '  ceil(log(40075017000 / 256 / GREATEST(ST_XMax(bbox) - ST_XMin(bbox), ST_YMax(bbox) - ST_YMin(bbox)))/log(2)),',
    '  0) as zoom',
    '  FROM bbox_query',
    '),',
    'pixel_size_query as (',
    '  SELECT 40075017 * cos(radians(ST_Y(ST_Transform(ST_Centroid(bbox), 4326)))) / 2 ^ ((zoom) + 8) as pixel_size',
    '  FROM bbox_query, zoom_query',
    '),',
    'scale_denominator_query as (',
    '  SELECT (pixel_size / 0.00028)::numeric as scale_denominator',
    '  FROM pixel_size_query',
    ')',
    'select ST_AsText(bbox) bbox, pixel_size, scale_denominator, zoom',
    'from bbox_query, pixel_size_query, scale_denominator_query, zoom_query'
].join('\n'));

TurboCartoAdapter.prototype._parseCartoCss = function (username, params, layer, layerIndex, layerId, callback) {
    if (!shouldParseLayerCartocss(layer)) {
        return callback(null, { layer: layer });
    }

    var pg = new PSQL(dbParamsFromReqParams(params));
    function processCallback (err, cartocss, meta) {
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
    }

    var layerSql = layer.options.sql;
    var layerRawSql = layer.options.sql_raw;
    if (SubstitutionTokens.hasTokens(layerSql) && layerRawSql && layer.options.sql_wrap) {
        // For wrapped queries we'll derive the tokens from the data extent
        // instead of the whole Earth/root tile.
        var self = this;
        var tokensQuery = tokensQueryTpl({ _sql: layerRawSql });
        return pg.query(tokensQuery, function (err, resultSet) {
            if (err) {
                return processCallback(err);
            }

            resultSet = resultSet || {};
            var rows = resultSet.rows || [];
            var result = rows[0] || {};

            var tokens = {
                bbox: 'ST_SetSRID(ST_GeomFromText(\'' + result.bbox + '\'), 3857)',
                scale_denominator: result.scale_denominator,
                pixel_width: result.pixel_size,
                pixel_height: result.pixel_size
            };

            var sql = SubstitutionTokens.replace(layerSql, tokens);
            self.process(pg, layer.options.cartocss, sql, processCallback);
        }, true); // use read-only transaction
    }

    var tokens = {
        bbox: 'ST_MakeEnvelope(-20037508.34,-20037508.34,20037508.34,20037508.34,3857)',
        scale_denominator: '500000001',
        pixel_width: '156412',
        pixel_height: '156412'
    };

    var sql = SubstitutionTokens.replace(layerSql, tokens);
    this.process(pg, layer.options.cartocss, sql, processCallback);
};

TurboCartoAdapter.prototype.process = function (psql, cartocss, sql, callback) {
    var datasource = new PostgresDatasource(psql, sql);
    turboCarto(cartocss, datasource, callback);
};

function shouldParseLayerCartocss (layer) {
    return layer && layer.options && layer.options.cartocss && layer.options.sql;
}
