'use strict';

const timeDimension = require('./time-dimension');

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

function optionsToParams (options) {
    return {
        sourceQuery: options.query,
        res: 256/options.resolution,
        columns: options.columns,
        dimensions: options.dimensions,
        filters: options.filters,
        placement: options.placement || DEFAULT_PLACEMENT
    };
}

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
const queryForOptions = (options) => templateForOptions(options)(optionsToParams(options));

module.exports = queryForOptions;

module.exports.infoForOptions = (options) => {
    const params = optionsToParams(options);
    const dimensions = {};
    dimensionNamesAndExpressions(params).forEach(([dimensionName, info]) => {
        dimensions[dimensionName] = {
            sql: info.sql,
            params: info.effectiveParams,
            type: info.type
        };
    });
    return dimensions;
};

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

const timeDimensionParameters = definition => {
    // definition.column should correspond to a wrapped date column
    const group = definition.group || {};
    return {
        time: `to_timestamp("${definition.column}")`,
        timezone: group.timezone || 'utc',
        units: group.units,
        count: group.count || 1,
        starting: group.starting,
        format: definition.format
    };
};

// Adapt old-style dimension definitions for backwards compatibility
const adaptDimensionDefinition = definition => {
    if (typeof(definition) === 'string') {
        return { column: definition };
    }
    return definition;
};

const dimensionExpression = definition => {
    if (definition.group) {
        // Currently only time dimensions are supported with parameters
        return Object.assign({ type: 'timeDimension' }, timeDimension(timeDimensionParameters(definition)));
    } else {
        return { sql: `"${definition.column}"` };
    }
};

const dimensionNamesAndExpressions = (ctx) => {
    let dimensions = aggregateDimensions(ctx);
    return Object.keys(dimensions).map(dimensionName => {
        const dimension = adaptDimensionDefinition(dimensions[dimensionName]);
        const expression = dimensionExpression(dimension);
        return [dimensionName, expression];
    });
};

const dimensionNames = (ctx, table) => {
    return sep(dimensionNamesAndExpressions(ctx).map(([dimensionName]) => {
        return table ? `${table}."${dimensionName}"` : `"${dimensionName}"`;
    }));
};

const dimensionDefs = ctx => {
    return sep(
        dimensionNamesAndExpressions(ctx)
        .map(([dimensionName, expression]) => `${expression.sql} AS "${dimensionName}"`)
    );
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
const gridResolution = ctx => {
    const minimumResolution = 2*Math.PI*6378137/Math.pow(2,38);
    return `${256/ctx.res} * GREATEST(!pixel_height!, ${minimumResolution})::numeric`;
};

const aggregatedPoint = ctx => {
    const placement = ctx.placement || DEFAULT_PLACEMENT;
    switch (placement) {
        case `centroid`:
            return `ST_SetSRID(ST_MakePoint(AVG(ST_X(the_geom_webmercator)), AVG(ST_Y(the_geom_webmercator))), 3857)`;
        case `point-grid`:
            return `ST_SetSRID(ST_MakePoint(AVG(ST_X(the_geom_webmercator)), AVG(ST_Y(the_geom_webmercator))), 3857)`;
        case `point-sample`:
            return `ST_SetSRID(ST_MakePoint(AVG(ST_X(the_geom_webmercator)), AVG(ST_Y(the_geom_webmercator))), 3857)`;
        default:
            throw new Error(`Invalid aggregation placement "${placement}`);
    }
};

// Notes:
// * We need to filter spatially using !bbox! to make the queries efficient because
//   the filter added by Mapnik (wrapping the query)
//   is only applied after the aggregation.
// * This queries are used for rendering and the_geom is omitted in the results for better performance
// * If the MVT extent or tile buffer was 0 or a multiple of the resolution we could use directly
//   the bbox for them, but in general we need to find the nearest cell limits inside the bbox.
// * bbox coordinates can have an error in the last digits; we apply a small correction before
//   applying CEIL or FLOOR to compensate for this, so that coordinates closer than a small (`eps`)
//   fraction of the cell size to a cell limit are moved to the exact limit.


const defaultAggregationQueryTemplate = ctx => `
SELECT
    min(cartodb_id) as cartodb_id,
    ${aggregatedPoint(ctx)} AS the_geom_webmercator
    ${dimensionDefs(ctx)}
    ${aggregateColumnDefs(ctx)}
FROM
(
    SELECT
        __cdb_src_query.*,
        cdb_limit_x,
        cdb_limit_y,
        ((ST_X(the_geom_webmercator) - __cdb_src_params.cdb_xmin) / __cdb_src_params.res)::int as cdb_pos_grid_x,
        ((ST_Y(the_geom_webmercator) - __cdb_src_params.cdb_ymin) / __cdb_src_params.res)::int as cdb_pos_grid_y
    FROM
    (
        ${ctx.sourceQuery}
    ) __cdb_src_query,
    (
        SELECT
            _cdb_grid_bbox_margins.*,
            ST_MakeEnvelope(cdb_xmin, cdb_ymin, cdb_xmax, cdb_ymax, 3857) AS cdb_point_bbox,
            ROUND((cdb_xmax - cdb_xmin) /  res)::int as cdb_limit_x,
            ROUND((cdb_ymax - cdb_ymin) /  res)::int as cdb_limit_y
        FROM
        (
            SELECT
                res,
                CEIL (ST_XMIN(cdb_full_bbox) / res) * res AS cdb_xmin,
                FLOOR(ST_XMAX(cdb_full_bbox) / res) * res AS cdb_xmax,
                CEIL (ST_YMIN(cdb_full_bbox) / res) * res AS cdb_ymin,
                FLOOR(ST_YMAX(cdb_full_bbox) / res) * res AS cdb_ymax
            FROM
            (
                SELECT
                    ${gridResolution(ctx)} AS res,
                    !bbox! cdb_full_bbox
                OFFSET 0
            ) _cdb_input_resources
        ) _cdb_grid_bbox_margins OFFSET 0
    ) __cdb_src_params
    WHERE the_geom_webmercator && cdb_point_bbox OFFSET 0
) __cdb_srd_grid
WHERE cdb_pos_grid_x < cdb_limit_x AND cdb_pos_grid_y < cdb_limit_y
GROUP BY cdb_pos_grid_x, cdb_pos_grid_y ${dimensionNames(ctx)}
${havingClause(ctx)}
`;

const aggregationQueryTemplates = {
    'centroid': defaultAggregationQueryTemplate,
    'point-grid': defaultAggregationQueryTemplate,
    'point-sample': defaultAggregationQueryTemplate

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
