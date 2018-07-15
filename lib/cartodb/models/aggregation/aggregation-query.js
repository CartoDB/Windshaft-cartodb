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
    filters: options.filters
});

module.exports = queryForOptions;

const SUPPORTED_AGGREGATE_FUNCTIONS = {
    'count': {
        sql: (column_name, params) => `count(${params.aggregated_column || '*'})`
    },
    'avg': {
        sql: (column_name, params) => `avg(${params.aggregated_column || column_name})`
    },
    'sum': {
        sql: (column_name, params) => `sum(${params.aggregated_column || column_name})`
    },
    'min': {
        sql: (column_name, params) => `min(${params.aggregated_column || column_name})`
    },
    'max': {
        sql: (column_name, params) => `max(${params.aggregated_column || column_name})`
    },
    'mode': {
        sql: (column_name, params) => `_cdb_mode(${params.aggregated_column || column_name})`
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
    if (table) {
        return sep(Object.keys(columns).map(
            column_name => `${table}.${column_name}`
        ));
    }
    return sep(Object.keys(columns));
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
        return `${aggregate_expression} AS ${column_name}`;
    }));
};

const aggregateDimensions = ctx => ctx.dimensions || {};

const dimensionNames = (ctx, table) => {
    let dimensions = aggregateDimensions(ctx);
    if (table) {
        return sep(Object.keys(dimensions).map(
            dimension_name => `${table}.${dimension_name}`
        ));
    }
    return sep(Object.keys(dimensions));
};

const dimensionDefs = ctx => {
    let dimensions = aggregateDimensions(ctx);
    return sep(Object.keys(dimensions).map(dimension_name => {
        const expression = dimensions[dimension_name];
        return `${expression} AS ${dimension_name}`;
    }));
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

const sqlQ = (value) => {
    if (isFinite(value)) {
        return String(value);
    }
    return `'${value}'`; // TODO: escape single quotes! (by doubling them)
};

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
            filtered_expr = dimensions[filtered_column];
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

// SQL expression to compute the aggregation resolution (grid cell size).
// This is defined by the ctx.res parameter, which is the number of grid cells per tile linear dimension
// (i.e. each tile is divided into ctx.res*ctx.res cells).
// We limit the the minimum resolution to avoid division by zero problems. The limit used is
// the pixel size of zoom level 30 (i.e. 1/2*(30+8) of the full earth web-mercator extent), which is about 0.15 mm.
// Computing this using !scale_denominator!, !pixel_width! or !pixel_height! produces
// inaccurate results due to rounding present in those values.
const gridResolution = ctx => {
    const minimumResolution = 2*Math.PI*6378137/Math.pow(2,38);
    return `GREATEST(${256/ctx.res}*CDB_XYZ_Resolution(CDB_ZoomFromScale(!scale_denominator!)), ${minimumResolution})::double precision`;
};

// Each aggregation cell is defined by the cell coordinates Floor(x/res), Floor(y/res),
// i.e. they include the West and South borders but not the East and North ones.
// So, to avoid picking points that don't belong to cells in the tile, given the tile
// limits Xmin, Ymin, Xmax, Ymax (bbox), we should select points that satisfy
// Xmin <= x < Xmax and Ymin <= y < Ymax (with x, y from the_geom_webmercator)
// On the other hand we can efficiently filter spatially (relying on spatial indexing)
// with `the_geom_webmercator && bbox` which is equivalent to
//   Xmin <= x <= Xmax and Ymin <= y <= Ymax
// So, in order to be both efficient and accurate we will need to use both
// conditions for spatial filtering.
const spatialFilter = `
  (_cdb_query.the_geom_webmercator && _cdb_params.bbox) AND
    ST_X(_cdb_query.the_geom_webmercator) >= _cdb_params.xmin AND ST_X(_cdb_query.the_geom_webmercator) < _cdb_params.xmax AND
    ST_Y(_cdb_query.the_geom_webmercator) >= _cdb_params.ymin AND ST_Y(_cdb_query.the_geom_webmercator) < _cdb_params.ymax
`;

// Notes:
// * We need to filter spatially using !bbox! to make the queries efficient because
//   the filter added by Mapnik (wrapping the query)
//   is only applied after the aggregation.
// * This queries are used for rendering and the_geom is omitted in the results for better performance
// * If the MVT extent or tile buffer was 0 or a multiple of the resolution we could use directly
//   the bbox for them, but in general we need to find the nearest cell limits inside the bbox.
const sqlParams = (ctx) => `
_cdb_res AS (
    SELECT
    ${gridResolution(ctx)} AS res,
    !bbox! AS bbox
),
_cdb_params AS (
    SELECT
      res,
      bbox,
      CEIL(ST_XMIN(bbox)/res)*res AS xmin,
      FLOOR(ST_XMAX(bbox)/res)*res AS xmax,
      CEIL(ST_YMIN(bbox)/res)*res AS ymin,
      FLOOR(ST_YMAX(bbox)/res)*res AS ymax
      FROM _cdb_res
)
`;

// The special default aggregation includes all the columns of a sample row per grid cell and
// the count (_cdb_feature_count) of the aggregated rows.
const defaultAggregationQueryTemplate = ctx => `
    WITH ${sqlParams(ctx)},
    _cdb_clusters AS (
        SELECT
            MIN(cartodb_id) AS cartodb_id
            ${dimensionDefs(ctx)}
            ${aggregateColumnDefs(ctx)}
        FROM (${ctx.sourceQuery}) _cdb_query, _cdb_params
        WHERE ${spatialFilter}
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
        WITH ${sqlParams(ctx)}
        SELECT
            MIN(_cdb_query.cartodb_id)  AS cartodb_id,
            ST_SetSRID(
                ST_MakePoint(
                    AVG(ST_X(_cdb_query.the_geom_webmercator)),
                    AVG(ST_Y(_cdb_query.the_geom_webmercator))
                ), 3857
            ) AS the_geom_webmercator
            ${dimensionDefs(ctx)}
            ${aggregateColumnDefs(ctx)}
        FROM (${ctx.sourceQuery}) _cdb_query, _cdb_params
        WHERE ${spatialFilter}
        GROUP BY
            Floor(ST_X(_cdb_query.the_geom_webmercator)/_cdb_params.res),
            Floor(ST_Y(_cdb_query.the_geom_webmercator)/_cdb_params.res)
            ${dimensionNames(ctx)}
        ${havingClause(ctx)}
    `,

    'point-grid': ctx => `
        WITH ${sqlParams(ctx)},
        _cdb_clusters AS (
            SELECT
            MIN(_cdb_query.cartodb_id) AS cartodb_id,
            Floor(ST_X(_cdb_query.the_geom_webmercator)/_cdb_params.res)::int AS _cdb_gx,
            Floor(ST_Y(_cdb_query.the_geom_webmercator)/_cdb_params.res)::int AS _cdb_gy
            ${dimensionDefs(ctx)}
            ${aggregateColumnDefs(ctx)}
            FROM (${ctx.sourceQuery}) _cdb_query, _cdb_params
            WHERE ${spatialFilter}
            GROUP BY _cdb_gx, _cdb_gy ${dimensionNames(ctx)}
            ${havingClause(ctx)}
        )
        SELECT
            _cdb_clusters.cartodb_id AS cartodb_id,
            ST_SetSRID(ST_MakePoint((_cdb_gx+0.5)*res, (_cdb_gy+0.5)*res), 3857) AS the_geom_webmercator
            ${dimensionNames(ctx)}
            ${aggregateColumnNames(ctx)}
            FROM _cdb_clusters, _cdb_params
    `,

    'point-sample': ctx => `
        WITH ${sqlParams(ctx)},
        _cdb_clusters AS (
            SELECT
                MIN(cartodb_id) AS cartodb_id
                ${dimensionDefs(ctx)}
                ${aggregateColumnDefs(ctx)}
            FROM (${ctx.sourceQuery}) _cdb_query, _cdb_params
            WHERE ${spatialFilter}
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
    `

};

module.exports.SUPPORTED_PLACEMENTS = Object.keys(aggregationQueryTemplates);
module.exports.GEOMETRY_COLUMN = 'the_geom_webmercator';
