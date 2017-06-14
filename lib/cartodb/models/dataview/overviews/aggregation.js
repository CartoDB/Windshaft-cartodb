var BaseOverviewsDataview = require('./base');
var BaseDataview = require('../aggregation');
var debug = require('debug')('windshaft:widget:aggregation:overview');

var dot = require('dot');
dot.templateSettings.strip = false;

var filteredQueryTpl = dot.template([
    'filtered_source AS (',
    '  SELECT *',
    '  FROM ({{=it._query}}) _cdb_filtered_source',
    '  {{?it._aggregationColumn}}',
    '  WHERE',
    '    {{=it._aggregationColumn}} != \'infinity\'::float',
    '  AND',
    '    {{=it._aggregationColumn}} != \'-infinity\'::float',
    '  AND',
    '    {{=it._aggregationColumn}} != \'NaN\'::float',
    '  {{?}}',
    ')'
].join(' \n'));

var summaryQueryTpl = dot.template([
    'summary AS (',
    '  SELECT',
    '  sum(_feature_count) AS count,',
    '  sum(CASE WHEN {{=it._column}} IS NULL THEN 1 ELSE 0 END) AS nulls_count,',
    '  sum(',
    '    CASE',
    '      WHEN {{=it._aggregationColumn}} = \'infinity\'::float OR {{=it._aggregationColumn}} = \'-infinity\'::float',
    '      THEN 1',
    '      ELSE 0',
    '    END',
    '  ) AS infinities_count,',
    '  sum(CASE WHEN {{=it._aggregationColumn}} = \'NaN\'::float THEN 1 ELSE 0 END) AS nans_count',
    '  FROM ({{=it._query}}) _cdb_aggregation_nulls',
    ')'
].join('\n'));

var rankedCategoriesQueryTpl = dot.template([
    'categories AS(',
    '  SELECT {{=it._column}} AS category, {{=it._aggregation}} AS value,',
    '    row_number() OVER (ORDER BY {{=it._aggregation}} desc) as rank',
    '  FROM filtered_source',
    '  {{?it._aggregationColumn!==null}}WHERE {{=it._aggregationColumn}} IS NOT NULL{{?}}',
    '  GROUP BY {{=it._column}}',
    '  ORDER BY 2 DESC',
    ')'
].join('\n'));

var categoriesSummaryMinMaxQueryTpl = dot.template([
    'categories_summary_min_max AS(',
    '  SELECT max(value) max_val, min(value) min_val',
    '  FROM categories',
    ')'
].join('\n'));

var categoriesSummaryCountQueryTpl = dot.template([
    'categories_summary_count AS(',
    '  SELECT count(1) AS categories_count',
    '  FROM (',
    '    SELECT {{=it._column}} AS category',
    '    FROM filtered_source',
    '    GROUP BY {{=it._column}}',
    '  ) _cdb_categories_count',
    ')'
].join('\n'));

var rankedAggregationQueryTpl = dot.template([
    'SELECT CAST(category AS text), value, false as agg, nulls_count, min_val, max_val,',
    '    count, categories_count, nans_count, infinities_count',
    '  FROM categories, summary, categories_summary_min_max, categories_summary_count',
    '  WHERE rank < {{=it._limit}}',
    'UNION ALL',
    'SELECT \'Other\' category, sum(value), true as agg, nulls_count, min_val, max_val,',
    '    count, categories_count, nans_count, infinities_count',
    '  FROM categories, summary, categories_summary_min_max, categories_summary_count',
    '  WHERE rank >= {{=it._limit}}',
    'GROUP BY nulls_count, min_val, max_val, count, categories_count, nans_count, infinities_count'
].join('\n'));

var aggregationQueryTpl = dot.template([
    'SELECT CAST({{=it._column}} AS text) AS category, {{=it._aggregation}} AS value, false as agg,',
    '  nulls_count, min_val, max_val, count, categories_count, nans_count, infinities_count',
    'FROM filtered_source, summary, categories_summary_min_max, categories_summary_count',
    'GROUP BY category, nulls_count, min_val, max_val, count, categories_count, nans_count, infinities_count',
    'ORDER BY value DESC'
].join('\n'));

var CATEGORIES_LIMIT = 6;

 function Aggregation(query, options, queryRewriter, queryRewriteData, params) {
    BaseOverviewsDataview.call(this, query, options, BaseDataview, queryRewriter, queryRewriteData, params);

    this.query = query;
    this.column = options.column;
    this.aggregation = options.aggregation;
    this.aggregationColumn = options.aggregationColumn;
}

Aggregation.prototype = Object.create(BaseOverviewsDataview.prototype);
Aggregation.prototype.constructor = Aggregation;

module.exports = Aggregation;

Aggregation.prototype.sql = function(psql, override, callback) {
    if (!callback) {
        callback = override;
        override = {};
    }

    var _query = this.rewrittenQuery(this.query);
    var _aggregationColumn = this.aggregation !== 'count' ? this.aggregationColumn : null;

    var aggregationSql;
    if (!!override.ownFilter) {
        aggregationSql = [
            "WITH",
            [
                filteredQueryTpl({
                    _query: _query,
                    _column: this.column,
                    _aggregationColumn: _aggregationColumn
                }),
                summaryQueryTpl({
                    _query: _query,
                    _column: this.column,
                    _aggregationColumn: _aggregationColumn
                }),
                rankedCategoriesQueryTpl({
                    _query: _query,
                    _column: this.column,
                    _aggregation: this.getAggregationSql(),
                    _aggregationColumn: _aggregationColumn
                }),
                categoriesSummaryMinMaxQueryTpl({
                    _query: _query,
                    _column: this.column
                }),
                categoriesSummaryCountQueryTpl({
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
                filteredQueryTpl({
                    _query: _query,
                    _column: this.column,
                    _aggregationColumn: _aggregationColumn
                }),
                summaryQueryTpl({
                    _query: _query,
                    _column: this.column,
                    _aggregationColumn: _aggregationColumn
                }),
                rankedCategoriesQueryTpl({
                    _query: _query,
                    _column: this.column,
                    _aggregation: this.getAggregationSql(),
                    _aggregationColumn: _aggregationColumn
                }),
                categoriesSummaryMinMaxQueryTpl({
                    _query: _query,
                    _column: this.column
                }),
                categoriesSummaryCountQueryTpl({
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
