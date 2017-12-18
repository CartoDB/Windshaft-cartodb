/**
 * Returns a template function (function that accepts template parameters and returns a string)
 * to generate an aggregation query.
 * Valid options to define the query template are:
 * - placement
 * The query template parameters taken by the result template function are:
 * - sourceQuery
 * - res
 * - columns
 * - dimensions
 */
const templateForOptions = (options) => {
    let templateFn = aggregationQueryTemplates[options.placement];
    if (!templateFn) {
        throw new Error("Invalid Aggregation placement: '" + options.placement + "'");
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
 */
const queryForOptions = (options) => templateForOptions(options)({
    sourceQuery: options.query,
    res: 256/options.resolution,
    columns: options.columns,
    dimensions: options.dimensions
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

const aggregateColumnNames = ctx => {
    let columns = aggregateColumns(ctx);
    return sep(Object.keys(columns));
};

const aggregateColumnDefs = ctx => {
    let columns = aggregateColumns(ctx);
    return sep(Object.keys(columns).map(column_name => {
        const aggregate_function = columns[column_name].aggregate_function || 'count';
        const aggregate_definition = SUPPORTED_AGGREGATE_FUNCTIONS[aggregate_function];
        if (!aggregate_definition) {
            throw new Error("Invalid Aggregate function: '" + aggregate_function + "'");
        }
        const aggregate_expression = aggregate_definition.sql(column_name, columns[column_name]);
        return `${aggregate_expression} AS ${column_name}`;
    }));
};


const aggregateDimensions = ctx => ctx.dimensions || {};

const dimensionNames = ctx => {
    return sep(Object.keys(aggregateDimensions(ctx)));
};

const dimensionDefs = ctx => {
    let dimensions = aggregateDimensions(ctx);
    return sep(Object.keys(dimensions).map(dimension_name => {
        const expression = dimensions[dimension_name];
        return `${expression} AS ${dimension_name}`;
    }));
};

// SQL expression to compute the aggregation resolution (grid cell size).
// This is equivalent to `${256/ctx.res}*CDB_XYZ_Resolution(CDB_ZoomFromScale(!scale_denominator!))`
// This is defined by the ctx.res parameter, which is the number of grid cells per tile linear dimension
// (i.e. each tile is divided into ctx.res*ctx.res cells).
const gridResolution = ctx => `(${256*0.00028/ctx.res}*!scale_denominator!)::double precision`;

// Notes:
// * We need to filter spatially using !bbox! to make the queries efficient because
//   the filter added by Mapnik (wrapping the query)
//   is only applied after the aggregation.
// * This queries are used for rendering and the_geom is omitted in the results for better performance

const aggregationQueryTemplates = {
    'centroid': ctx => `
        WITH _cdb_params AS (
            SELECT
            ${gridResolution(ctx)} AS res,
            !bbox! AS bbox
        )
        SELECT
            row_number() over() AS cartodb_id,
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
    `,

    'point-grid': ctx => `
    WITH _cdb_params AS (
        SELECT
        ${gridResolution(ctx)} AS res,
        !bbox! AS bbox
    ),
    _cdb_clusters AS (
        SELECT
        Floor(ST_X(_cdb_query.the_geom_webmercator)/_cdb_params.res)::int AS _cdb_gx,
        Floor(ST_Y(_cdb_query.the_geom_webmercator)/_cdb_params.res)::int AS _cdb_gy
        ${dimensionDefs(ctx)}
        ${aggregateColumnDefs(ctx)}
        FROM (${ctx.sourceQuery}) _cdb_query, _cdb_params
        WHERE the_geom_webmercator && _cdb_params.bbox
        GROUP BY _cdb_gx, _cdb_gy ${dimensionNames(ctx)}
    )
    SELECT
        ST_SetSRID(ST_MakePoint((_cdb_gx+0.5)*res, (_cdb_gy+0.5)*res), 3857) AS the_geom_webmercator
        ${dimensionNames(ctx)}
        ${aggregateColumnNames(ctx)}
        FROM _cdb_clusters, _cdb_params
    `,

    'point-sample': ctx => `
        WITH _cdb_params AS (
            SELECT
            ${gridResolution(ctx)} AS res,
            !bbox! AS bbox
        ), _cdb_clusters AS (
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
            _cdb_clusters.cartodb_id,
            the_geom, the_geom_webmercator
            ${dimensionNames(ctx)}
            ${aggregateColumnNames(ctx)}
        FROM
            _cdb_clusters INNER JOIN (${ctx.sourceQuery}) _cdb_query
            ON (_cdb_clusters.cartodb_id = _cdb_query.cartodb_id)
    `
};
