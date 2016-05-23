var BaseOverviewsWidget = require('./base');
var BaseDataview = require('../aggregation');
var debug = require('debug')('windshaft:widget:ovaggregation');

var dot = require('dot');
dot.templateSettings.strip = false;

var summaryQueryTpl = dot.template([
    'summary AS (',
    '  SELECT',
    '  sum(_feature_count) AS count,',
    '  sum(CASE WHEN {{=it._column}} IS NULL THEN 1 ELSE 0 END) AS nulls_count',
    '  FROM ({{=it._query}}) _cdb_aggregation_nulls',
    ')'
].join('\n'));

var rankedCategoriesQueryTpl = dot.template([
    'categories AS(',
    '  SELECT {{=it._column}} AS category, {{=it._aggregation}} AS value,',
    '    row_number() OVER (ORDER BY {{=it._aggregation}} desc) as rank',
    '  FROM ({{=it._query}}) _cdb_aggregation_all',
    '  GROUP BY {{=it._column}}',
    '  ORDER BY 2 DESC',
    ')'
].join('\n'));

var categoriesSummaryQueryTpl = dot.template([
    'categories_summary AS(',
    '  SELECT count(1) categories_count, max(value) max_val, min(value) min_val',
    '  FROM categories',
    ')'
].join('\n'));

var rankedAggregationQueryTpl = dot.template([
    'SELECT CAST(category AS text), value, false as agg, nulls_count, min_val, max_val, count, categories_count',
    '  FROM categories, summary, categories_summary',
    '  WHERE rank < {{=it._limit}}',
    'UNION ALL',
    'SELECT \'Other\' category, sum(value), true as agg, nulls_count, min_val, max_val, count, categories_count',
    '  FROM categories, summary, categories_summary',
    '  WHERE rank >= {{=it._limit}}',
    'GROUP BY nulls_count, min_val, max_val, count, categories_count'
].join('\n'));

var aggregationQueryTpl = dot.template([
    'SELECT CAST({{=it._column}} AS text) AS category, {{=it._aggregation}} AS value, false as agg,',
    '  nulls_count, min_val, max_val, count, categories_count',
    'FROM ({{=it._query}}) _cdb_aggregation_all, summary, categories_summary',
    'GROUP BY category, nulls_count, min_val, max_val, count, categories_count',
    'ORDER BY value DESC'
].join('\n'));

var CATEGORIES_LIMIT = 6;

/**
 {
     type: 'aggregation',
     options: {
         column: 'name',
         aggregation: 'count' // it could be, e.g., sum if column is numeric
     }
 }
 */
 function Aggregation(query, options, queryRewriter, queryRewriteData, params) {
    BaseOverviewsWidget.call(this, query, options, BaseDataview, queryRewriter, queryRewriteData, params);

    this.query = query;
    this.column = options.column;
    this.aggregation = options.aggregation;
    this.aggregationColumn = options.aggregationColumn;
}

Aggregation.prototype = Object.create(BaseOverviewsWidget.prototype);
Aggregation.prototype.constructor = Aggregation;

module.exports = Aggregation;

Aggregation.prototype.sql = function(psql, filters, override, callback) {
    if (!callback) {
        callback = override;
        override = {};
    }

    var _query = this.rewrittenQuery(this.query);

    var aggregationSql;
    if (!!override.ownFilter) {
        aggregationSql = [
            "WITH",
            [
                summaryQueryTpl({
                    _query: _query,
                    _column: this.column
                }),
                rankedCategoriesQueryTpl({
                    _query: _query,
                    _column: this.column,
                    _aggregation: this.getAggregationSql()
                }),
                categoriesSummaryQueryTpl({
                    _query: _query,
                    _column: this.column
                })
            ].join(',\n'),
            aggregationQueryTpl({
                _query: _query,
                _column: this.column,
                _aggregation: this.getAggregationSql(),
                _limit: CATEGORIES_LIMIT
            })
        ].join('\n');
    } else {
        aggregationSql = [
            "WITH",
            [
                summaryQueryTpl({
                    _query: _query,
                    _column: this.column
                }),
                rankedCategoriesQueryTpl({
                    _query: _query,
                    _column: this.column,
                    _aggregation: this.getAggregationSql()
                }),
                categoriesSummaryQueryTpl({
                    _query: _query,
                    _column: this.column
                })
            ].join(',\n'),
            rankedAggregationQueryTpl({
                _query: _query,
                _column: this.column,
                _limit: CATEGORIES_LIMIT
            })
        ].join('\n');
    }

    debug(aggregationSql);

    return callback(null, aggregationSql);
};

var aggregationFnQueryTpl = {
    count: dot.template('sum(_feature_count)'),
    sum:   dot.template('sum({{=it._aggregationColumn}}*_feature_count)')
};

Aggregation.prototype.getAggregationSql = function() {
    return aggregationFnQueryTpl[this.aggregation]({
        _aggregationFn: this.aggregation,
        _aggregationColumn: this.aggregationColumn || 1
    });
};
