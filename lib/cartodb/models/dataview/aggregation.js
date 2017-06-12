var _ = require('underscore');
var BaseWidget = require('./base');
var debug = require('debug')('windshaft:widget:aggregation');

var dot = require('dot');
dot.templateSettings.strip = false;

var filteredQueryTpl = dot.template([
    'filtered_source AS (',
    '  SELECT *',
    '  FROM ({{=it._query}}) _cdb_filtered_source',
    '  WHERE',
    '    {{=it._column}} IS NOT NULL',
    '  AND',
    '    {{=it._aggregationColumn}} != \'infinity\'::float',
    '  AND',
    '    {{=it._aggregationColumn}} != \'-infinity\'::float',
    '  AND',
    '    {{=it._aggregationColumn}} != \'NaN\'::float',
    ')'
].join(' \n'));

var summaryQueryTpl = dot.template([
    'summary AS (',
    '  SELECT',
    '  count(1) AS count,',
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
    '    FROM ({{=it._query}}) _cdb_categories',
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
    'SELECT \'Other\' category, {{=it._aggregationFn}}(value) as value, true as agg, nulls_count,',
    '       min_val, max_val, count, categories_count, nans_count, infinities_count',
    '  FROM categories, summary, categories_summary_min_max, categories_summary_count',
    '  WHERE rank >= {{=it._limit}}',
    'GROUP BY nulls_count, min_val, max_val, count, categories_count, nans_count, infinities_count'
].join('\n'));

var aggregationQueryTpl = dot.template([
    'SELECT CAST({{=it._column}} AS text) AS category, {{=it._aggregation}} AS value, false as agg,',
    '  nulls_count, min_val, max_val, count, categories_count, nans_count, infinities_count',
    'FROM ({{=it._query}}) _cdb_aggregation_all, summary, categories_summary_min_max, categories_summary_count',
    'GROUP BY category, nulls_count, min_val, max_val, count, categories_count, nans_count, infinities_count',
    'ORDER BY value DESC'
].join('\n'));

var CATEGORIES_LIMIT = 6;

var VALID_OPERATIONS = {
    count: [],
    sum: ['aggregationColumn'],
    avg: ['aggregationColumn'],
    min: ['aggregationColumn'],
    max: ['aggregationColumn']
};

var TYPE = 'aggregation';

/**
 {
     type: 'aggregation',
     options: {
         column: 'name',
         aggregation: 'count' // it could be, e.g., sum if column is numeric
     }
 }
 */
function Aggregation(query, options) {
    if (!_.isString(options.column)) {
        throw new Error('Aggregation expects `column` in widget options');
    }

    if (!_.isString(options.aggregation)) {
        throw new Error('Aggregation expects `aggregation` operation in widget options');
    }

    if (!VALID_OPERATIONS[options.aggregation]) {
        throw new Error("Aggregation does not support '" + options.aggregation + "' operation");
    }

    var requiredOptions = VALID_OPERATIONS[options.aggregation];
    var missingOptions = _.difference(requiredOptions, Object.keys(options));
    if (missingOptions.length > 0) {
        throw new Error(
            "Aggregation '" + options.aggregation + "' is missing some options: " + missingOptions.join(',')
        );
    }

    BaseWidget.apply(this);

    this.query = query;
    this.column = options.column;
    this.aggregation = options.aggregation;
    this.aggregationColumn = options.aggregationColumn;
}

Aggregation.prototype = new BaseWidget();
Aggregation.prototype.constructor = Aggregation;

module.exports = Aggregation;

Aggregation.prototype.sql = function(psql, override, callback) {
    if (!callback) {
        callback = override;
        override = {};
    }

    var _query = this.query;

    var aggregationSql;

    if (!!override.ownFilter) {
        aggregationSql = [
            this.getCategoriesCTESql(_query, this.column, this.aggregation, this.aggregationColumn),
            aggregationQueryTpl({
                _query: _query,
                _column: this.column,
                _aggregation: this.getAggregationSql(),
                _limit: CATEGORIES_LIMIT
            })
        ].join('\n');
    } else {
        aggregationSql = [
            this.getCategoriesCTESql(_query, this.column, this.aggregation, this.aggregationColumn),
            rankedAggregationQueryTpl({
                _query: _query,
                _column: this.column,
                _aggregationFn: this.aggregation !== 'count' ? this.aggregation : 'sum',
                _limit: CATEGORIES_LIMIT
            })
        ].join('\n');
    }

    debug(aggregationSql);

    return callback(null, aggregationSql);
};

Aggregation.prototype.getCategoriesCTESql = function(query, column, aggregation, aggregationColumn) {
    return [
        "WITH",
        [
            filteredQueryTpl({
                _query: this.query,
                _column: this.column,
                _aggregationColumn: aggregation !== 'count' ? aggregationColumn : null
            }),
            summaryQueryTpl({
                _query: query,
                _column: column,
                _aggregationColumn: aggregation !== 'count' ? aggregationColumn : null
            }),
            rankedCategoriesQueryTpl({
                _query: query,
                _column: column,
                _aggregation: this.getAggregationSql(),
                _aggregationColumn: aggregation !== 'count' ? aggregationColumn : null
            }),
            categoriesSummaryMinMaxQueryTpl({
                _query: query,
                _column: column
            }),
            categoriesSummaryCountQueryTpl({
                _query: query,
                _column: column
            })
        ].join(',\n')
    ].join('\n');
};

var aggregationFnQueryTpl = dot.template('{{=it._aggregationFn}}({{=it._aggregationColumn}})');
Aggregation.prototype.getAggregationSql = function() {
    return aggregationFnQueryTpl({
        _aggregationFn: this.aggregation,
        _aggregationColumn: this.aggregationColumn || 1
    });
};

Aggregation.prototype.format = function(result) {
    var categories = [];
    var count = 0;
    var nulls = 0;
    var nans = 0;
    var infinities = 0;
    var minValue = 0;
    var maxValue = 0;
    var categoriesCount = 0;


    if (result.rows.length) {
        var firstRow = result.rows[0];
        count = firstRow.count;
        nulls = firstRow.nulls_count;
        nans = firstRow.nans_count;
        infinities = firstRow.infinities_count;
        minValue = firstRow.min_val;
        maxValue = firstRow.max_val;
        categoriesCount = firstRow.categories_count;

        result.rows.forEach(function(row) {
            categories.push(_.omit(row, 'count', 'nulls_count', 'min_val',
                'max_val', 'categories_count', 'nans_count', 'infinities_count'));
        });
    }

    return {
        aggregation: this.aggregation,
        count: count,
        nulls: nulls,
        nans: nans,
        infinities: infinities,
        min: minValue,
        max: maxValue,
        categoriesCount: categoriesCount,
        categories: categories
    };
};

var filterCategoriesQueryTpl = dot.template([
    'SELECT {{=it._column}} AS category, {{=it._value}} AS value',
    'FROM ({{=it._query}}) _cdb_aggregation_search',
    'WHERE CAST({{=it._column}} as text) ILIKE {{=it._userQuery}}',
    'GROUP BY {{=it._column}}'
].join('\n'));

var searchQueryTpl = dot.template([
    'WITH',
    'search_unfiltered AS (',
    '  {{=it._searchUnfiltered}}',
    '),',
    'search_filtered AS (',
    '  {{=it._searchFiltered}}',
    '),',
    'search_union AS (',
    '  SELECT * FROM search_unfiltered',
    '  UNION ALL',
    '  SELECT * FROM search_filtered',
    ')',
    'SELECT category, sum(value) AS value',
    'FROM search_union',
    'GROUP BY category',
    'ORDER BY value desc'
].join('\n'));


Aggregation.prototype.search = function(psql, userQuery, callback) {
    var self = this;

    var _userQuery = psql.escapeLiteral('%' + userQuery + '%');

    // TODO unfiltered will be wrong as filters are already applied at this point
    var query = searchQueryTpl({
        _searchUnfiltered: filterCategoriesQueryTpl({
            _query: this.query,
            _column: this.column,
            _value: '0',
            _userQuery: _userQuery
        }),
        _searchFiltered: filterCategoriesQueryTpl({
            _query: this.query,
            _column: this.column,
            _value: 'count(1)',
            _userQuery: _userQuery
        })
    });

    psql.query(query, function(err, result) {
        if (err) {
            return callback(err, result);
        }

        return callback(null, {type: self.getType(), categories: result.rows });
    }, true); // use read-only transaction
};

Aggregation.prototype.getType = function() {
    return TYPE;
};

Aggregation.prototype.toString = function() {
    return JSON.stringify({
        _type: TYPE,
        _query: this.query,
        _column: this.column,
        _aggregation: this.aggregation
    });
};
