const DEFAULT_PLACEMENT = 'point-sample';

/**
 * Returns a template function (function that accepts template parameters and returns a string)
 * to generate an aggregation query.
 * Valid options to define the query template are:
 * - placement
 * - columns
 * - dimensions*
 * The query template parameters taken by the result template function are:
 * - sourceQuery
 * - res
 * - columns
 * - dimensions
 */
const templateForOptions = (options) => {
    let templateFn = defaultAggregationQueryTemplate;
    if (!options.isDefaultAggregation) {
        templateFn = aggregationQueryTemplates[options.placement || DEFAULT_PLACEMENT];
        if (!templateFn) {
            throw new Error("Invalid Aggregation placement: '" + options.placement + "'");
        }
    }
    return templateFn;
};

/**
 * Generates an aggregation query given the aggregation options:
 * - query
 * - resolution - defined as in torque:
 *   aggregation cell is resolution*resolution pixels, where tiles are always 256x256 pixels
 * - columns
 * - placement
 * - dimensions
 *
 * The default aggregation (when no explicit placement, columns or dimensions are present) returns
 * a sample record (with all the original columns and _cdb_feature_count) for each aggregation group.
 * When placement, columns or dimensions are specified, columns are aggregated as requested
 * (by default only _cdb_feature_count) and with the_geom_webmercator as defined by placement.
 */
const queryForOptions = (options) => templateForOptions(options)({
    sourceQuery: options.query,
    res: 256/options.resolution,
    columns: options.columns,
    dimensions: options.dimensions,
    filters: options.filters,
    order: options.order
});

module.exports = queryForOptions;

const SUPPORTED_AGGREGATE_FUNCTIONS = {
    'count': {
        sql: (column_name, params) => `count(${sqlId(params.aggregated_column) || '*'})`
    },
    'avg': {
        sql: (column_name, params) => `avg(${sqlId(params.aggregated_column || column_name)})`
    },
    'sum': {
        sql: (column_name, params) => `sum(${sqlId(params.aggregated_column || column_name)})`
    },
    'min': {
        sql: (column_name, params) => `min(${sqlId(params.aggregated_column || column_name)})`
    },
    'max': {
        sql: (column_name, params) => `max(${sqlId(params.aggregated_column || column_name)})`
    },
    'mode': {
        sql: (column_name, params) => `_cdb_mode(${sqlId(params.aggregated_column || column_name)})`
    }
};

module.exports.SUPPORTED_AGGREGATE_FUNCTIONS = Object.keys(SUPPORTED_AGGREGATE_FUNCTIONS);

const sep = (list) => {
    let expr = list.join(', ');
    return expr ? ', ' + expr : expr;
};

const aggregateColumns = ctx => {
    return Object.assign({
        _cdb_feature_count: {
            aggregate_function: 'count'
        }
    }, ctx.columns || {});
};

const aggregateColumnNames = (ctx, table) => {
    let columns = aggregateColumns(ctx);
    return sep(Object.keys(columns).map(columnName => qualCol(columnName, table)));
};

const aggregateExpression = (column_name, column_parameters) => {
    const aggregate_function = column_parameters.aggregate_function || 'count';
    const aggregate_definition = SUPPORTED_AGGREGATE_FUNCTIONS[aggregate_function];
    if (!aggregate_definition) {
        throw new Error("Invalid Aggregate function: '" + aggregate_function + "'");
    }
    return aggregate_definition.sql(column_name, column_parameters);
};

const aggregateColumnDefs = ctx => {
    let columns = aggregateColumns(ctx);
    return sep(Object.keys(columns).map(column_name => {
        const aggregate_expression = aggregateExpression(column_name, columns[column_name]);
        return `${aggregate_expression} AS ${sqlId(column_name)}`;
    }));
};

const aggregateDimensions = ctx => ctx.dimensions || {};

const qualCol(columnName, tableName=null) => {
    let q = sqlId(columnName);
    if (tableName) {
        q = `${sqlId(tableName)}.${q}`;
    }
    return q;
};

const dimensionNames = (ctx, table) => {
    let dimensions = aggregateDimensions(ctx);
    return sep(Object.keys(dimensions).map(columnName => qualCol(columnName, table)));
};

const dimensionDefs = ctx => {
    let dimensions = aggregateDimensions(ctx);
    return sep(Object.keys(dimensions).map(dimension_name => {
        const expression = groupingExpression(dimensions[dimension_name]);
        return `${expression} AS ${sqlId(dimension_name)}`;
    }));
};

const TIME_CLASSIFICATIONS = {
  year: () => {},
  month: () => {},
  week: () => {},
  day: () => {},
  hour: () => {},
};

const groupingExpression = (expr, table=null) => {
    const column = qualCol(expr.column, table);
    const classification = expr.classification;
    if (classification) {
        if (Object.keys(TIME_CLASSIFICATIONS).includes(classification)) {
            // time classification
            TIME_CLASSIFICATIONS[class]
        }
        else {
            // numeric range classification
            const ranges = classification.map((value, i) => `WHEN ${column} < ${sqlQ(value)} THEN ${i}`).join(' ');
            return `(CASE WHEN ${column} IS NULL THE NULL ${ranges} ELSE ${ranges.length + 1} END)::int`;
        }
    }

    return expr.column;
};

const aggregateFilters = ctx => ctx.filters || {};

const filterConditionSQL = (expr, filter) => {
    // TODO: validate filter parameters (e.g. cannot have both greater_than and greater_than or equal to)

    if (filter) {
        if (!Array.isArray(filter)) {
            filter = [filter];
        }
        if (filter.length > 0) {
            return filter.map(f => filterSingleConditionSQL(expr, f)).join(' OR ');
        }
    }
};

const filterSingleConditionSQL = (expr, filter) => {
    let cond;
    Object.keys(FILTERS).some(f => {
        cond = FILTERS[f](expr, filter);
        return cond;
    });
    return cond;
};

function sqlId(id) {
    if (id === undefined) {
        return null;
    }
    if (!id.match(/^[a-z\d_]+$/)) {
        id = `"${id.replace(/\"/g,'""')}"`;
    }
    return id;
}

function sqlQ(value) {
    if (value === undefined) {
        return null;
    }
    if (isFinite(value)) {
        return String(value);
    }
    return `'${value.replace(/\'/g,'\'\'')}'`;
}

/* jshint eqeqeq: false */
/* x != null is used to check for both null and undefined; triple !== wouldn't do the trick */

const FILTERS = {
    between: (expr, filter) => {
        const lo = filter.greater_than_or_equal_to, hi = filter.less_than_or_equal_to;
        if (lo != null && hi != null) {
            return `(${expr} BETWEEN ${sqlQ(lo)} AND ${sqlQ(hi)})`;
        }
    },
    in: (expr, filter) => {
        if (filter.in != null) {
            return `(${expr} IN (${filter.in.map(v => sqlQ(v)).join(',')}))`;
        }
    },
    notin: (expr, filter) => {
        if (filter.not_in != null) {
            return `(${expr} NOT IN (${filter.not_in.map(v => sqlQ(v)).join(',')}))`;
        }
    },
    equal: (expr, filter) => {
        if (filter.equal != null) {
            return `(${expr} = ${sqlQ(filter.equal)})`;
        }
    },
    not_equal: (expr, filter) => {
        if (filter.not_equal != null) {
            return `(${expr} <> ${sqlQ(filter.not_equal)})`;
        }
    },
    range: (expr, filter) => {
        let conds = [];
        if (filter.greater_than_or_equal_to != null) {
            conds.push(`(${expr} >= ${sqlQ(filter.greater_than_or_equal_to)})`);
        }
        if (filter.greater_than != null) {
            conds.push(`(${expr} > ${sqlQ(filter.greater_than)})`);
        }
        if (filter.less_than_or_equal_to != null) {
            conds.push(`(${expr} <= ${sqlQ(filter.less_than_or_equal_to)})`);
        }
        if (filter.less_than != null) {
            conds.push(`(${expr} < ${sqlQ(filter.less_than)})`);
        }
        if (conds.length > 0) {
            return conds.join(' AND ');
        }
    }
};

const filterConditions = ctx => {
    let columns = aggregateColumns(ctx);
    let dimensions = aggregateDimensions(ctx);
    let filters = aggregateFilters(ctx);
    return Object.keys(filters).map(filtered_column => {
        let filtered_expr;
        if (columns[filtered_column]) {
            filtered_expr = aggregateExpression(filtered_column, columns[filtered_column]);
        }
        else if (dimensions[filtered_column]) {
            filtered_expr = groupingExpression(filtered_column, dimensions[filtered_column]);
        }
        if (!filtered_expr) {
            throw new Error("Invalid filtered column: '" + filtered_column + "'");
        }
        return filterConditionSQL(filtered_expr, filters[filtered_column]);
    }).join(' AND ');
};

const havingClause = ctx => {
    let cond = filterConditions(ctx);
    return cond ? `HAVING ${cond}` : '';
};

const aggregateOrdering = ctx => ctx.order || [];

const orderClause = ctx => {
    let ordering = aggregateOrdering(ctx);
    if (!ordering || ordering.length === 0) {
        return '';
    }
    let columns = aggregateColumns(ctx);
    let dimensions = aggregateDimensions(ctx);
    let orderExpr =  ordering.map(order_column => {
        let [column, direction] = order_column.split(':');
        direction = direction || 'asc';
        if (!['asc', 'desc'].includes(direction)) {
            throw new Error("Invalid ordering direction: '" + direction + "' in '" + order_column + "'");
        }
        if (!columns[column] && !dimensions[column] && column !== 'cartodb_id') {
            throw new Error("Invalid ordering column: '" + column + "'");
        }
        return `${sqlId(column)} ${direction}`;
    }).join(', ');
    return `ORDER BY ${orderExpr}`;
}

// SQL expression to compute the aggregation resolution (grid cell size).
// This is equivalent to `${256/ctx.res}*CDB_XYZ_Resolution(CDB_ZoomFromScale(!scale_denominator!))`
// This is defined by the ctx.res parameter, which is the number of grid cells per tile linear dimension
// (i.e. each tile is divided into ctx.res*ctx.res cells).
// We limit the the minimum resolution to avoid division by zero problems. The limit used is
// the pixel size of zoom level 30 (i.e. 1/2*(30+8) of the full earth web-mercator extent), which is about 0.15 mm.
const gridResolution = ctx => {
    const minimumResolution = 2*Math.PI*6378137/Math.pow(2,38);
    return `GREATEST(${256*0.00028/ctx.res}*!scale_denominator!, ${minimumResolution})::double precision`;
};

// Notes:
// * We need to filter spatially using !bbox! to make the queries efficient because
//   the filter added by Mapnik (wrapping the query)
//   is only applied after the aggregation.
// * This queries are used for rendering and the_geom is omitted in the results for better performance

// The special default aggregation includes all the columns of a sample row per grid cell and
// the count (_cdb_feature_count) of the aggregated rows.
const defaultAggregationQueryTemplate = ctx => `
    WITH
    _cdb_params AS (
        SELECT
        ${gridResolution(ctx)} AS res,
        !bbox! AS bbox
    ),
    _cdb_clusters AS (
        SELECT
            MIN(cartodb_id) AS cartodb_id
            ${dimensionDefs(ctx)}
            ${aggregateColumnDefs(ctx)}
        FROM (${ctx.sourceQuery}) _cdb_query, _cdb_params
        WHERE _cdb_query.the_geom_webmercator && _cdb_params.bbox
        GROUP BY
            Floor(ST_X(_cdb_query.the_geom_webmercator)/_cdb_params.res),
            Floor(ST_Y(_cdb_query.the_geom_webmercator)/_cdb_params.res)
            ${dimensionNames(ctx)}
    ) SELECT
        _cdb_query.*
        ${aggregateColumnNames(ctx)}
    FROM
        _cdb_clusters INNER JOIN (${ctx.sourceQuery}) _cdb_query
        ON (_cdb_clusters.cartodb_id = _cdb_query.cartodb_id)
`;

const aggregationQueryTemplates = {
    'centroid': ctx => `
        WITH
        _cdb_params AS (
            SELECT
            ${gridResolution(ctx)} AS res,
            !bbox! AS bbox
        )
        SELECT
            row_number() over() AS cartodb_id,
            -- MIN(_cdb_query.cartodb_id)  AS cartodb_id,
            ST_SetSRID(
                ST_MakePoint(
                    AVG(ST_X(_cdb_query.the_geom_webmercator)),
                    AVG(ST_Y(_cdb_query.the_geom_webmercator))
                ), 3857
            ) AS the_geom_webmercator
            ${dimensionDefs(ctx)}
            ${aggregateColumnDefs(ctx)}
        FROM (${ctx.sourceQuery}) _cdb_query, _cdb_params
        WHERE _cdb_query.the_geom_webmercator && _cdb_params.bbox
        GROUP BY
            Floor(ST_X(_cdb_query.the_geom_webmercator)/_cdb_params.res),
            Floor(ST_Y(_cdb_query.the_geom_webmercator)/_cdb_params.res)
            ${dimensionNames(ctx)}
        ${havingClause(ctx)}
        ${orderClause(ctx)}
    `,

    'point-grid': ctx => `
        WITH
        _cdb_params AS (
            SELECT
            ${gridResolution(ctx)} AS res,
            !bbox! AS bbox
        ),
        _cdb_clusters AS (
            SELECT
            MIN(_cdb_query.cartodb_id) AS cartodb_id,
            Floor(ST_X(_cdb_query.the_geom_webmercator)/_cdb_params.res)::int AS _cdb_gx,
            Floor(ST_Y(_cdb_query.the_geom_webmercator)/_cdb_params.res)::int AS _cdb_gy
            ${dimensionDefs(ctx)}
            ${aggregateColumnDefs(ctx)}
            FROM (${ctx.sourceQuery}) _cdb_query, _cdb_params
            WHERE the_geom_webmercator && _cdb_params.bbox
            GROUP BY _cdb_gx, _cdb_gy ${dimensionNames(ctx)}
            ${havingClause(ctx)}
        )
        SELECT
            _cdb_clusters.cartodb_id AS cartodb_id,
            ST_SetSRID(ST_MakePoint((_cdb_gx+0.5)*res, (_cdb_gy+0.5)*res), 3857) AS the_geom_webmercator
            ${dimensionNames(ctx)}
            ${aggregateColumnNames(ctx)}
            FROM _cdb_clusters, _cdb_params
            ${orderClause(ctx)}
    `,

    'point-sample': ctx => `
        WITH
        _cdb_params AS (
            SELECT
            ${gridResolution(ctx)} AS res,
            !bbox! AS bbox
        ),
        _cdb_clusters AS (
            SELECT
                MIN(cartodb_id) AS cartodb_id
                ${dimensionDefs(ctx)}
                ${aggregateColumnDefs(ctx)}
            FROM (${ctx.sourceQuery}) _cdb_query, _cdb_params
            WHERE _cdb_query.the_geom_webmercator && _cdb_params.bbox
            GROUP BY
                Floor(ST_X(_cdb_query.the_geom_webmercator)/_cdb_params.res),
                Floor(ST_Y(_cdb_query.the_geom_webmercator)/_cdb_params.res)
                ${dimensionNames(ctx)}
            ${havingClause(ctx)}
        )
        SELECT
            _cdb_clusters.cartodb_id,
            the_geom, the_geom_webmercator
            ${dimensionNames(ctx, '_cdb_clusters')}
            ${aggregateColumnNames(ctx, '_cdb_clusters')}
        FROM
            _cdb_clusters INNER JOIN (${ctx.sourceQuery}) _cdb_query
            ON (_cdb_clusters.cartodb_id = _cdb_query.cartodb_id)
        ${orderClause(ctx)}
    `

};

module.exports.SUPPORTED_PLACEMENTS = Object.keys(aggregationQueryTemplates);
module.exports.GEOMETRY_COLUMN = 'the_geom_webmercator';

const clusterFeaturesQuery = ctx => `
    WITH
    _cdb_params AS (
        SELECT
        ${gridResolution(ctx)} AS res
    ),
    _cell AS (
        SELECT
        ST_MakeEnvelope(
            Floor(ST_X(_cdb_query.the_geom_webmercator)/_cdb_params.res)*_cdb_params.res,
            Floor(ST_Y(_cdb_query.the_geom_webmercator)/_cdb_params.res)*_cdb_params.res,
            Floor(ST_X(_cdb_query.the_geom_webmercator)/_cdb_params.res + 1)*_cdb_params.res,
            Floor(ST_Y(_cdb_query.the_geom_webmercator)/_cdb_params.res + 1)*_cdb_params.res,
            3857
        ) AS bbox
        FROM (${ctx.sourceQuery}) _cdb_query, _cdb_params
        WHERE _cdb_query.cartodb_id = ${ctx.id}
    )
    SELECT _cdb_query.* FROM _cell, (${ctx.sourceQuery}) _cdb_query
        WHERE ST_Intersects(_cdb_query.the_geom_webmercator, _cell.bbox)
`;

module.exports.featuresQuery = (id, options) => clusterFeaturesQuery({
    id,
    sourceQuery: options.query,
    res: 256/options.resolution
});
