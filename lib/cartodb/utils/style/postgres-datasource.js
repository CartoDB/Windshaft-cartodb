'use strict';

var dot = require('dot');
dot.templateSettings.strip = false;

function createTemplate(method) {
    return dot.template([
        'SELECT',
        method,
        'FROM ({{=it._sql}}) _table_sql WHERE {{=it._column}} IS NOT NULL'
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
    '  ORDER BY 2 DESC',
    '),',
    'agg_categories AS (',
    '  SELECT \'__other\' category',
    '  FROM categories',
    '  WHERE rank >= {{=it._buckets}}',
    '  GROUP BY 1',
    '  UNION ALL',
    '  SELECT CAST(category AS text)',
    '  FROM categories',
    '  WHERE rank < {{=it._buckets}}',
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

function PostgresDatasource (pgQueryRunner, username, query) {
    this.pgQueryRunner = pgQueryRunner;
    this.username = username;
    this.query = query;
}

PostgresDatasource.prototype.getName = function () {
    return 'PostgresDatasource';
};

PostgresDatasource.prototype.getRamp = function (column, buckets, method, callback) {
    var methodName = methodTemplates.hasOwnProperty(method) ? method : 'quantiles';
    var template = methodTemplates[methodName];

    var query = template({ _column: column, _sql: this.query, _buckets: buckets });

    this.pgQueryRunner.run(this.username, query, function (err, result) {
        if (err) {
            return callback(err);
        }

        var strategy = method2strategy[methodName];
        var ramp = result[0][methodName];
        if (strategy !== STRATEGY.EXACT) {
            ramp = ramp.sort(function(a, b) {
                return a - b;
            });
        }

        return callback(null, { ramp: ramp, strategy: strategy });
    });
};

module.exports = PostgresDatasource;
