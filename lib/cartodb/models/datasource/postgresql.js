'use strict';

var dot = require('dot');
dot.templateSettings.strip = false;

var SubstitutionTokens = require('../../utils/substitution-tokens');

var Datasource = require('./base');

function PostgreSQLDatasource(psql, layer, layerId) {
    Datasource.apply(this);

    this.psql = psql;
    this.layer = layer;
    this.layerSql = layer.options.sql;
    this.layerId = layerId;
}
PostgreSQLDatasource.prototype = new Datasource();
PostgreSQLDatasource.prototype.constructor = PostgreSQLDatasource;

module.exports = PostgreSQLDatasource;
module.exports.TYPE = 'postgresql';

PostgreSQLDatasource.prototype.id = function() {
    return this.layerId;
};
PostgreSQLDatasource.prototype.getQuery = function(/*applyFilters*/) {
    return this.layerSql;
};

PostgreSQLDatasource.prototype.getType = function() {
    // we mimic here an analysis source node
    return 'source';
};

PostgreSQLDatasource.prototype.getFilters = function() {
    return {};
};

PostgreSQLDatasource.prototype.getAffectedTables = function() {
    return [];
};

PostgreSQLDatasource.prototype.getMetadata = function() {
    return {};
};

// -------------------------- turbo-carto interface --------------------------

PostgreSQLDatasource.prototype.getName = function() {
    return 'PostgreSQLDatasource';
};

function createTemplate(method) {
    return dot.template([
        'SELECT',
        'min({{=it._column}}) min_val,',
        'max({{=it._column}}) max_val,',
        'avg({{=it._column}}) avg_val,',
        method,
        'FROM ({{=it._sql}}) _table_sql WHERE {{=it._column}} IS NOT NULL',
        'AND',
        '  {{=it._column}} != \'infinity\'::float',
        'AND',
        '  {{=it._column}} != \'-infinity\'::float',
        'AND',
        '  {{=it._column}} != \'NaN\'::float'
    ].join('\n'));
}


var methods = {
    quantiles: 'CDB_QuantileBins(array_agg(distinct({{=it._column}}::numeric)), {{=it._buckets}}) as quantiles',
    equal: 'CDB_EqualIntervalBins(array_agg({{=it._column}}::numeric), {{=it._buckets}}) as equal',
    jenks: 'CDB_JenksBins(array_agg(distinct({{=it._column}}::numeric)), {{=it._buckets}}) as jenks',
    headtails: 'CDB_HeadsTailsBins(array_agg(distinct({{=it._column}}::numeric)), {{=it._buckets}}) as headtails'
};


var methodTemplates = Object.keys(methods).reduce(function(methodTemplates, methodName) {
    methodTemplates[methodName] = createTemplate(methods[methodName]);
    return methodTemplates;
}, {});

methodTemplates.category = dot.template([
    'WITH',
    'categories AS (',
    '  SELECT {{=it._column}} AS category, count(1) AS value, row_number() OVER (ORDER BY count(1) desc) as rank',
    '  FROM ({{=it._sql}}) _cdb_aggregation_all',
    '  GROUP BY {{=it._column}}',
    '  ORDER BY 2 DESC, 1 ASC',
    '),',
    'agg_categories AS (',
    '  SELECT category',
    '  FROM categories',
    '  WHERE rank <= {{=it._buckets}}',
    ')',
    'SELECT array_agg(category) AS category FROM agg_categories'
].join('\n'));

var STRATEGY = {
    SPLIT: 'split',
    EXACT: 'exact'
};

var method2strategy = {
    headtails: STRATEGY.SPLIT,
    category: STRATEGY.EXACT
};


PostgreSQLDatasource.prototype.getRamp = function(column, buckets, method, callback) {
    if (method && !methodTemplates.hasOwnProperty(method)) {
        return callback(new Error(
            'Invalid method "' + method + '", valid methods: [' + Object.keys(methodTemplates).join(',') + ']'
        ));
    }

    var self = this;


    this.preprareRampSql(function(err, sql) {

        var methodName = method || 'quantiles';
        var template = methodTemplates[methodName];

        var query = template({ _column: column, _sql: sql, _buckets: buckets });

        self.psql.query(query, function (err, resultSet) {
            if (err) {
                return callback(err);
            }

            var result = getResult(resultSet);
            var strategy = method2strategy[methodName];
            var ramp = result[methodName] || [];
            var stats = {
                min_val: result.min_val,
                max_val: result.max_val,
                avg_val: result.avg_val
            };
            // Skip null values from ramp
            // Generated turbo-carto won't be correct, but better to keep it working than failing
            // TODO fix cartodb-postgres extension quantification functions
            ramp = ramp.filter(function(value) { return value !== null; });
            if (strategy !== STRATEGY.EXACT) {
                ramp = ramp.sort(function(a, b) {
                    return a - b;
                });
            }

            return callback(null, { ramp: ramp, strategy: strategy, stats: stats });
        }, true); // use read-only transaction
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

PostgreSQLDatasource.prototype.preprareRampSql = function(callback) {

    var layerSql = this.getLayerQuery();
    var layerRawSql = this.getQuery();

    if (SubstitutionTokens.hasTokens(layerSql) && this.layer && this.layer.options.sql_wrap) {
        var tokensQuery = tokensQueryTpl({_sql: layerRawSql});
        return this.psql.query(tokensQuery, function(err, resultSet) {
            if (err) {
                return callback(err);
            }

            resultSet = resultSet || {};
            var rows = resultSet.rows || [];
            var result = rows[0] || {};

            var tokens = {
                bbox: 'ST_SetSRID(ST_GeomFromText(\'' + result.bbox + '\'), 3857)',
                scale_denominator: result.scale_denominator,
                pixel_width: result.pixel_size,
                pixel_height: result.pixel_size,
                var_zoom: '5',
                var_bbox: '[-20037508.34,-20037508.34,20037508.34,20037508.34]',
                var_x: '0',
                var_y: '0'
            };

            return callback(null, SubstitutionTokens.replace(layerSql, tokens));
        }, true); // use read-only transaction
    }

    var tokens = {
        bbox: 'ST_MakeEnvelope(-20037508.34,-20037508.34,20037508.34,20037508.34,3857)',
        scale_denominator: '500000001',
        pixel_width: '156412',
        pixel_height: '156412',
        var_zoom: '5',
        var_bbox: '[-20037508.34,-20037508.34,20037508.34,20037508.34]',
        var_x: '0',
        var_y: '0'
    };

    return callback(null, SubstitutionTokens.replace(layerSql, tokens));
};

function getResult(resultSet) {
    resultSet = resultSet || {};
    var result = resultSet.rows || [];
    result = result[0] || {};

    return result;
}


// --------------------------- Dataviews interface ---------------------------

