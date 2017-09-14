const BaseWidget = require('./base');
const debug = require('debug')('windshaft:widget:aggregation');

const filteredQueryTpl = ctx => `
    filtered_source AS (
        SELECT *
        FROM (${ctx.query}) _cdb_filtered_source
        ${ctx.aggregationColumn && ctx.isFloatColumn ? `
        WHERE
            ${ctx.aggregationColumn} != 'infinity'::float
        AND
            ${ctx.aggregationColumn} != '-infinity'::float
        AND
            ${ctx.aggregationColumn} != 'NaN'::float` :
        ''
        }
    )
`;

const summaryQueryTpl = ctx => `
    summary AS (
        SELECT
            count(1) AS count,
            sum(CASE WHEN ${ctx.column} IS NULL THEN 1 ELSE 0 END) AS nulls_count
            ${ctx.isFloatColumn ? `,
            sum(
                CASE
                    WHEN ${ctx.aggregationColumn} = 'infinity'::float OR ${ctx.aggregationColumn} = '-infinity'::float
                    THEN 1
                    ELSE 0
                    END
            ) AS infinities_count,
            sum(CASE WHEN ${ctx.aggregationColumn} = 'NaN'::float THEN 1 ELSE 0 END) AS nans_count` :
            ''
            }
        FROM (${ctx.query}) _cdb_aggregation_nulls
    )
`;

const rankedCategoriesQueryTpl = ctx => `
    categories AS(
        SELECT
            ${ctx.column} AS category,
            ${ctx.aggregationFn} AS value,
            row_number() OVER (ORDER BY ${ctx.aggregationFn} desc) as rank
        FROM filtered_source
        ${ctx.aggregationColumn !== null ? `WHERE ${ctx.aggregationColumn} IS NOT NULL` : ''}
        GROUP BY ${ctx.column}
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
            SELECT ${ctx.column} AS category
            FROM (${ctx.query}) _cdb_categories
            GROUP BY ${ctx.column}
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
        ${ctx.isFloatColumn ? `${specialNumericValuesColumns(ctx)}` : '' }
        FROM categories, summary, categories_summary_min_max, categories_summary_count
        WHERE rank < ${ctx.limit}
    UNION ALL
    SELECT
        'Other' category,
        ${ctx.aggregation !== 'count' ? ctx.aggregation : 'sum'}(value) as value,
        true as agg,
        nulls_count,
        min_val,
        max_val,
        count,
        categories_count
        ${ctx.isFloatColumn ? `${specialNumericValuesColumns(ctx)}` : '' }
        FROM categories, summary, categories_summary_min_max, categories_summary_count
        WHERE rank >= ${ctx.limit}
    GROUP BY
        nulls_count,
        min_val,
        max_val,
        count,
        categories_count
        ${ctx.isFloatColumn ? `${specialNumericValuesColumns(ctx)}` : '' }
`;

const aggregationQueryTpl = ctx => `
    SELECT
        CAST(${ctx.column} AS text) AS category,
        ${ctx.aggregationFn} AS value,
        false as agg,
        nulls_count,
        min_val,
        max_val,
        count,
        categories_count
        ${ctx.isFloatColumn ? `${specialNumericValuesColumns(ctx)}` : '' }
    FROM (${ctx.query}) _cdb_aggregation_all, summary, categories_summary_min_max, categories_summary_count
    GROUP BY
        category,
        nulls_count,
        min_val,
        max_val,
        count,
        categories_count
        ${ctx.isFloatColumn ? `${specialNumericValuesColumns(ctx)}` : '' }
    ORDER BY value DESC
`;

const aggregationFnQueryTpl = ctx => `${ctx.aggregation}(${ctx.aggregationColumn})`;

const aggregationDataviewQueryTpl = ctx => `
    WITH
    ${filteredQueryTpl(ctx)},
    ${summaryQueryTpl(ctx)},
    ${rankedCategoriesQueryTpl(ctx)},
    ${categoriesSummaryMinMaxQueryTpl(ctx)},
    ${categoriesSummaryCountQueryTpl(ctx)}
    ${!!ctx.override.ownFilter ? `${aggregationQueryTpl(ctx)}` : `${rankedAggregationQueryTpl(ctx)}`}
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

    var aggregationSql = aggregationDataviewQueryTpl({
        override: override,
        query: this.query,
        column: this.column,
        aggregation: this.aggregation,
        aggregationColumn: this.aggregation !== 'count' ? this.aggregationColumn : null,
        aggregationFn: aggregationFnQueryTpl({
            aggregation: this.aggregation,
            aggregationColumn: this.aggregationColumn || 1
        }),
        isFloatColumn: this._isFloatColumn,
        limit: CATEGORIES_LIMIT
    });

    debug(aggregationSql);

    return callback(null, aggregationSql);
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
        ${ctx.column} AS category,
        ${ctx.value} AS value
    FROM (${ctx.query}) _cdb_aggregation_search
    WHERE CAST(${ctx.column} as text) ILIKE ${ctx.userQuery}
    GROUP BY ${ctx.column}
`;

const searchQueryTpl = ctx => `
    WITH
    search_unfiltered AS (
        ${filterCategoriesQueryTpl({
            query: ctx.query,
            column: ctx.column,
            value: '0',
            userQuery: escapedUserQuery
        })}
    ),
    search_filtered AS (
        ${filterCategoriesQueryTpl({
            query: ctx.query,
            column: ctx.column,
            value: value,
            userQuery: escapedUserQuery
        })}
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

    var escapedUserQuery = psql.escapeLiteral('%' + userQuery + '%');
    var value = this.aggregation !== 'count' && this.aggregationColumn ?
        this.aggregation + '(' + this.aggregationColumn + ')' : 'count(1)';

    // TODO unfiltered will be wrong as filters are already applied at this point
    var query = searchQueryTpl({
        query: this.query,
        column: this.column,
        value: value,
        userQuery: escapedUserQuery
    });

    debug(query);

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
