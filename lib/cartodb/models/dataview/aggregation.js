const BaseWidget = require('./base');
const debug = require('debug')('windshaft:widget:aggregation');

const filteredQueryTpl = ctx => `
    filtered_source AS (
        SELECT *
        FROM (${ctx._query}) _cdb_filtered_source
        ${ctx._aggregationColumn && ctx._isFloatColumn ? `
        WHERE
            ${ctx._aggregationColumn} != 'infinity'::float
        AND
            ${ctx._aggregationColumn} != '-infinity'::float
        AND
            ${ctx._aggregationColumn} != 'NaN'::float` :
        ''
        }
    )
`;

const summaryQueryTpl = ctx => `
    summary AS (
        SELECT
            count(1) AS count,
            sum(CASE WHEN ${ctx._column} IS NULL THEN 1 ELSE 0 END) AS nulls_count
            ${ctx._isFloatColumn ? `,
            sum(
                CASE
                    WHEN ${ctx._aggregationColumn} = 'infinity'::float OR ${ctx._aggregationColumn} = '-infinity'::float
                    THEN 1
                    ELSE 0
                    END
            ) AS infinities_count,
            sum(CASE WHEN ${ctx._aggregationColumn} = 'NaN'::float THEN 1 ELSE 0 END) AS nans_count` :
            ''
            }
        FROM (${ctx._query}) _cdb_aggregation_nulls
    )
`;

const rankedCategoriesQueryTpl = ctx => `
    categories AS(
        SELECT
            ${ctx._column} AS category,
            ${ctx._aggregation} AS value,
            row_number() OVER (ORDER BY ${ctx._aggregation} desc) as rank
        FROM filtered_source
        ${ctx._aggregationColumn !== null ? `WHERE ${ctx._aggregationColumn} IS NOT NULL` : ''}
        GROUP BY ${ctx._column}
        ORDER BY 2 DESC
    )
`;

const categoriesSummaryMinMaxQueryTpl = () => `
    categories_summary_min_max AS(
        SELECT
            max(value) max_val,
            min(value) min_val
        FROM categories
    )
`;

const categoriesSummaryCountQueryTpl = ctx => `
    categories_summary_count AS(
        SELECT count(1) AS categories_count
        FROM (
            SELECT ${ctx._column} AS category
            FROM (${ctx._query}) _cdb_categories
            GROUP BY ${ctx._column}
        ) _cdb_categories_count
    )
`;

const specialNumericValuesColumns = () => `, nans_count, infinities_count`;

const rankedAggregationQueryTpl = ctx => `
    SELECT
        CAST(category AS text),
        value,
        false as agg,
        nulls_count,
        min_val,
        max_val,
        count,
        categories_count
        ${ctx._isFloatColumn ? `${specialNumericValuesColumns(ctx)}` : '' }
        FROM categories, summary, categories_summary_min_max, categories_summary_count
        WHERE rank < ${ctx._limit}
    UNION ALL
    SELECT
        'Other' category,
        ${ctx._aggregationFn}(value) as value,
        true as agg,
        nulls_count,
        min_val,
        max_val,
        count,
        categories_count
        ${ctx._isFloatColumn ? `${specialNumericValuesColumns(ctx)}` : '' }
        FROM categories, summary, categories_summary_min_max, categories_summary_count
        WHERE rank >= ${ctx._limit}
    GROUP BY
        nulls_count,
        min_val,
        max_val,
        count,
        categories_count
        ${ctx._isFloatColumn ? `${specialNumericValuesColumns(ctx)}` : '' }
`;

const aggregationQueryTpl = ctx => `
    SELECT
        CAST(${ctx._column} AS text) AS category,
        ${ctx._aggregation} AS value,
        false as agg,
        nulls_count,
        min_val,
        max_val,
        count,
        categories_count
        ${ctx._isFloatColumn ? `${specialNumericValuesColumns(ctx)}` : '' }
    FROM (${ctx._query}) _cdb_aggregation_all, summary, categories_summary_min_max, categories_summary_count
    GROUP BY
        category,
        nulls_count,
        min_val,
        max_val,
        count,
        categories_count
        ${ctx._isFloatColumn ? `${specialNumericValuesColumns(ctx)}` : '' }
    ORDER BY value DESC
`;

const CATEGORIES_LIMIT = 6;

const VALID_OPERATIONS = {
    count: [],
    sum: ['aggregationColumn'],
    avg: ['aggregationColumn'],
    min: ['aggregationColumn'],
    max: ['aggregationColumn']
};

const TYPE = 'aggregation';

/**
 {
     type: 'aggregation',
     options: {
         column: 'name',
         aggregation: 'count' // it could be, e.g., sum if column is numeric
     }
 }
 */
function Aggregation(query, options = {}, queries = {}) {
    if (typeof options.column !== 'string') {
        throw new Error(`Aggregation expects 'column' in widget options`);
    }

    if (typeof options.aggregation !== 'string') {
        throw new Error(`Aggregation expects 'aggregation' operation in widget options`);
    }

    if (!VALID_OPERATIONS[options.aggregation]) {
       throw new Error(`Aggregation does not support '${options.aggregation}' operation`);
    }

    var requiredOptions = VALID_OPERATIONS[options.aggregation];
    var missingOptions = requiredOptions.filter(requiredOption => !options.hasOwnProperty(requiredOption));

    if (missingOptions.length > 0) {
        throw new Error(`Aggregation '${options.aggregation}' is missing some options: ${missingOptions.join(',')}`);
    }

    BaseWidget.apply(this);

    this.query = query;
    this.queries = queries;
    this.column = options.column;
    this.aggregation = options.aggregation;
    this.aggregationColumn = options.aggregationColumn;
    this._isFloatColumn = null;
}

Aggregation.prototype = new BaseWidget();
Aggregation.prototype.constructor = Aggregation;

module.exports = Aggregation;

Aggregation.prototype.sql = function(psql, override, callback) {
    var self = this;

    if (!callback) {
        callback = override;
        override = {};
    }

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

    var _query = this.query;

    var aggregationSql;

    if (!!override.ownFilter) {
        aggregationSql = [
            this.getCategoriesCTESql(
                _query,
                this.column,
                this.aggregation,
                this.aggregationColumn,
                this._isFloatColumn
            ),
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
            this.getCategoriesCTESql(
                _query,
                this.column,
                this.aggregation,
                this.aggregationColumn,
                this._isFloatColumn
            ),
            rankedAggregationQueryTpl({
                _isFloatColumn: this._isFloatColumn,
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

Aggregation.prototype.getCategoriesCTESql = function(query, column, aggregation, aggregationColumn, isFloatColumn) {
    return `
        WITH
            ${filteredQueryTpl({
                _isFloatColumn: isFloatColumn,
                _query: this.query,
                _column: this.column,
                _aggregationColumn: aggregation !== 'count' ? aggregationColumn : null
            })},
            ${summaryQueryTpl({
                _isFloatColumn: isFloatColumn,
                _query: query,
                _column: column,
                _aggregationColumn: aggregation !== 'count' ? aggregationColumn : null
            })},
            ${rankedCategoriesQueryTpl({
                _query: query,
                _column: column,
                _aggregation: this.getAggregationSql(),
                _aggregationColumn: aggregation !== 'count' ? aggregationColumn : null
            })},
            ${categoriesSummaryMinMaxQueryTpl({
                _query: query,
                _column: column
            })},
            ${categoriesSummaryCountQueryTpl({
                _query: query,
                _column: column
            })}
    `;
};

const aggregationFnQueryTpl = ctx => `${ctx._aggregationFn}(${ctx._aggregationColumn})`;

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
        categories = result.rows.map(({ category, value, agg }) => ({ category, value, agg }));
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

const filterCategoriesQueryTpl = ctx => `
    SELECT
        ${ctx._column} AS category,
        ${ctx._value} AS value
    FROM (${ctx._query}) _cdb_aggregation_search
    WHERE CAST(${ctx._column} as text) ILIKE ${ctx._userQuery}
    GROUP BY ${ctx._column}
`;

const searchQueryTpl = ctx => `
    WITH
    search_unfiltered AS (
        ${ctx._searchUnfiltered}
    ),
    search_filtered AS (
        ${ctx._searchFiltered}
    ),
    search_union AS (
        SELECT * FROM search_unfiltered
        UNION ALL
        SELECT * FROM search_filtered
    )
    SELECT category, sum(value) AS value
    FROM search_union
    GROUP BY category
    ORDER BY value desc
`;

Aggregation.prototype.search = function(psql, userQuery, callback) {
    var self = this;

    var _userQuery = psql.escapeLiteral('%' + userQuery + '%');
    var _value = this.aggregation !== 'count' && this.aggregationColumn ?
        this.aggregation + '(' + this.aggregationColumn + ')' : 'count(1)';

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
            _value: _value,
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
