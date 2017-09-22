'use strict';

var dot = require('dot');
dot.templateSettings.strip = false;

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
    quantiles: 'CDB_QuantileBins(array_agg({{=it._column}}::numeric), {{=it._buckets}}) as quantiles',
    equal: 'CDB_EqualIntervalBins(array_agg({{=it._column}}::numeric), {{=it._buckets}}) as equal',
    jenks: 'CDB_JenksBins(array_agg({{=it._column}}::numeric), {{=it._buckets}}) as jenks',
    headtails: 'CDB_HeadsTailsBins(array_agg({{=it._column}}::numeric), {{=it._buckets}}) as headtails'
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

function PostgresDatasource (psql, query) {
    this.psql = psql;
    this.query = query;
}

PostgresDatasource.prototype.getName = function () {
    return 'PostgresDatasource';
};

PostgresDatasource.prototype.getRamp = function (column, buckets, method, callback) {
    if (method && !methodTemplates.hasOwnProperty(method)) {
        return callback(new Error(
            'Invalid method "' + method + '", valid methods: [' + Object.keys(methodTemplates).join(',') + ']'
        ));
    }
    var methodName = method || 'quantiles';
    var template = methodTemplates[methodName];

    var query = template({ _column: column, _sql: this.query, _buckets: buckets });

    this.psql.query(query, function (err, resultSet) {
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
};

function getResult(resultSet) {
    resultSet = resultSet || {};
    var result = resultSet.rows || [];
    result = result[0] || {};

    return result;
}

module.exports = PostgresDatasource;
