'use strict';

var BaseOverviewsDataview = require('./base');
var BaseDataview = require('../aggregation');
var debug = require('debug')('windshaft:widget:aggregation:overview');

var dot = require('dot');
dot.templateSettings.strip = false;

var filteredQueryTpl = dot.template([
    'filtered_source AS (',
    '  SELECT *',
    '  FROM ({{=it._query}}) _cdb_filtered_source',
    '  {{?it._aggregationColumn  && it._isFloatColumn}}WHERE',
    '    {{=it._aggregationColumn}} != \'infinity\'::float',
    '  AND',
    '    {{=it._aggregationColumn}} != \'-infinity\'::float',
    '  AND',
    '    {{=it._aggregationColumn}} != \'NaN\'::float{{?}}',
    ')'
].join(' \n'));

var summaryQueryTpl = dot.template([
    'summary AS (',
    '  SELECT',
    '  sum(_feature_count) AS count,',
    '  sum(CASE WHEN {{=it._column}} IS NULL THEN 1 ELSE 0 END) AS nulls_count',
    '  {{?it._isFloatColumn}},sum(',
    '    CASE',
    '      WHEN {{=it._aggregationColumn}} = \'infinity\'::float OR {{=it._aggregationColumn}} = \'-infinity\'::float',
    '      THEN 1',
    '      ELSE 0',
    '    END',
    '  ) AS infinities_count,',
    '  sum(CASE WHEN {{=it._aggregationColumn}} = \'NaN\'::float THEN 1 ELSE 0 END) AS nans_count{{?}}',
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
    '    count, categories_count{{?it._isFloatColumn}}, nans_count, infinities_count{{?}}',
    '  FROM categories, summary, categories_summary_min_max, categories_summary_count',
    '  WHERE rank < {{=it._limit}}',
    'UNION ALL',
    'SELECT \'Other\' category, sum(value), true as agg, nulls_count, min_val, max_val,',
    '    count, categories_count{{?it._isFloatColumn}}, nans_count, infinities_count{{?}}',
    '  FROM categories, summary, categories_summary_min_max, categories_summary_count',
    '  WHERE rank >= {{=it._limit}}',
    'GROUP BY nulls_count, min_val, max_val, count,',
    '  categories_count{{?it._isFloatColumn}}, nans_count, infinities_count{{?}}'
].join('\n'));

var aggregationQueryTpl = dot.template([
    'SELECT CAST({{=it._column}} AS text) AS category, {{=it._aggregation}} AS value, false as agg,',
    '  nulls_count, min_val, max_val, count, categories_count{{?it._isFloatColumn}}, nans_count, infinities_count{{?}}',
    'FROM filtered_source, summary, categories_summary_min_max, categories_summary_count',
    'GROUP BY category, nulls_count, min_val, max_val, count,',
    '  categories_count{{?it._isFloatColumn}}, nans_count, infinities_count{{?}}',
    'ORDER BY value DESC'
].join('\n'));

var CATEGORIES_LIMIT = 6;

function Aggregation (query, options, queryRewriter, queryRewriteData, params, queries) {
    BaseOverviewsDataview.call(this, query, options, BaseDataview, queryRewriter, queryRewriteData, params, queries);

    this._checkOptions(options);

    this.query = query;
    this.queries = queries;
    this.column = options.column;
    this.aggregation = options.aggregation;
    this.aggregationColumn = options.aggregationColumn;
    this._isFloatColumn = null;
}

Aggregation.prototype = Object.create(BaseOverviewsDataview.prototype);
Aggregation.prototype.constructor = Aggregation;

module.exports = Aggregation;

Aggregation.prototype.sql = function (psql, override, callback) {
    var self = this;

    if (!callback) {
        callback = override;
        override = {};
    }

    var _query = this.rewrittenQuery(this.query);
    var _aggregationColumn = this.aggregation !== 'count' ? this.aggregationColumn : null;

    if (this.aggregationColumn && this._isFloatColumn === null) {
        this._isFloatColumn = false;
        this.getColumnType(psql, this.aggregationColumn, this.queries.no_filters, function (err, type) {
            if (!err && !!type) {
                self._isFloatColumn = type.float;
            }
            self.sql(psql, override, callback);
        });
        return null;
    }

    var aggregationSql;
    if (override.ownFilter) {
        aggregationSql = [
            'WITH',
            [
                filteredQueryTpl({
                    _isFloatColumn: this._isFloatColumn,
                    _query: _query,
                    _column: this.column,
                    _aggregationColumn: _aggregationColumn
                }),
                summaryQueryTpl({
                    _isFloatColumn: this._isFloatColumn,
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
                _isFloatColumn: this._isFloatColumn,
                _query: _query,
                _column: this.column,
                _aggregation: this.getAggregationSql(),
                _limit: CATEGORIES_LIMIT
            })
        ].join('\n');
    } else {
        aggregationSql = [
            'WITH',
            [
                filteredQueryTpl({
                    _isFloatColumn: this._isFloatColumn,
                    _query: _query,
                    _column: this.column,
                    _aggregationColumn: _aggregationColumn
                }),
                summaryQueryTpl({
                    _isFloatColumn: this._isFloatColumn,
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
                _isFloatColumn: this._isFloatColumn,
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
    sum: dot.template('sum({{=it._aggregationColumn}}*_feature_count)')
};

const VALID_OPERATIONS = {
    count: [],
    sum: ['aggregationColumn']
};

Aggregation.prototype._checkOptions = function (options) {
    if (!VALID_OPERATIONS[options.aggregation]) {
        throw new Error(`Aggregation does not support '${options.aggregation}' operation in dataview overview options`);
    }

    const requiredOptions = VALID_OPERATIONS[options.aggregation];
    const missingOptions = requiredOptions.filter(requiredOption => !Object.prototype.hasOwnProperty.call(options, requiredOption));

    if (missingOptions.length > 0) {
        throw new Error(
            `Aggregation '${options.aggregation}' is missing some options for overview: ${missingOptions.join(',')}`
        );
    }
};

Aggregation.prototype.getAggregationSql = function () {
    return aggregationFnQueryTpl[this.aggregation]({
        _aggregationFn: this.aggregation,
        _aggregationColumn: this.aggregationColumn || 1
    });
};
