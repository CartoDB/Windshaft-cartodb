'use strict';

const timeDimension = require('./time-dimension');

const DEFAULT_PLACEMENT = 'point-sample';
const WebMercatorHelper = require('cartodb-query-tables').utils.webMercatorHelper;
const webmercator = new WebMercatorHelper();

function optionsToParams (options) {
    return {
        sourceQuery: options.query,
        res: 256 / options.resolution,
        columns: options.columns,
        dimensions: options.dimensions,
        filters: options.filters,
        placement: options.placement || DEFAULT_PLACEMENT,
        isDefaultAggregation: options.isDefaultAggregation
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
const queryForOptions = (options) => aggregationQueryTemplate(optionsToParams(options));

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
    count: {
        sql: (columnName, params) => `count(${params.aggregated_column || '*'})`
    },
    avg: {
        sql: (columnName, params) => `avg(${params.aggregated_column || columnName})`
    },
    sum: {
        sql: (columnName, params) => `sum(${params.aggregated_column || columnName})`
    },
    min: {
        sql: (columnName, params) => `min(${params.aggregated_column || columnName})`
    },
    max: {
        sql: (columnName, params) => `max(${params.aggregated_column || columnName})`
    },
    mode: {
        sql: (columnName, params) => `mode() WITHIN GROUP (ORDER BY ${params.aggregated_column || columnName})`
    }
};

module.exports.SUPPORTED_AGGREGATE_FUNCTIONS = Object.keys(SUPPORTED_AGGREGATE_FUNCTIONS);

const sep = (list) => {
    const expr = list.join(', ');
    return expr ? ', ' + expr : expr;
};

const aggregateColumns = ctx => {
    return Object.assign({
        _cdb_feature_count: {
            aggregate_function: 'count'
        }
    }, ctx.columns || {});
};

const aggregateExpression = (columnName, columnParameters) => {
    const aggregateFunction = columnParameters.aggregate_function || 'count';
    const aggregateDefinition = SUPPORTED_AGGREGATE_FUNCTIONS[aggregateFunction];
    if (!aggregateDefinition) {
        throw new Error("Invalid Aggregate function: '" + aggregateFunction + "'");
    }
    return aggregateDefinition.sql(columnName, columnParameters);
};

const aggregateColumnDefs = ctx => {
    const columns = aggregateColumns(ctx);
    return sep(Object.keys(columns).map(columnName => {
        const aggregate = aggregateExpression(columnName, columns[columnName]);
        return `${aggregate} AS ${columnName}`;
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
    if (typeof (definition) === 'string') {
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
    const dimensions = aggregateDimensions(ctx);
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
        const lo = filter.greater_than_or_equal_to; const hi = filter.less_than_or_equal_to;
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
        const conds = [];
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
    const columns = aggregateColumns(ctx);
    const dimensions = aggregateDimensions(ctx);
    const filters = aggregateFilters(ctx);
    return Object.keys(filters).map(filteredColumn => {
        let filteredExpr;
        if (columns[filteredColumn]) {
            filteredExpr = aggregateExpression(filteredColumn, columns[filteredColumn]);
        } else if (dimensions[filteredColumn]) {
            filteredExpr = dimensions[filteredColumn];
        }
        if (!filteredExpr) {
            throw new Error("Invalid filtered column: '" + filteredColumn + "'");
        }
        return filterConditionSQL(filteredExpr, filters[filteredColumn]);
    }).join(' AND ');
};

const havingClause = ctx => {
    const cond = filterConditions(ctx);
    return cond ? `HAVING ${cond}` : '';
};

// SQL expression to compute the aggregation resolution (grid cell size).
// This is defined by the ctx.res parameter, which is the number of grid cells per tile linear dimension
// (i.e. each tile is divided into ctx.res*ctx.res cells).
// We limit the the minimum resolution to avoid division by zero problems. The limit used is
// the pixel size of zoom level 30 (i.e. 1/2*(30+8) of the full earth web-mercator extent), which is about 0.15 mm.
//
// NOTE: We'd rather use !pixel_width!, but in Mapnik this value is extent / 256 for raster
// and extent / tile_extent {4096 default} for MVT, so since aggregations are always based
// on 256 we can't have the same query in both cases
// As this scale change doesn't happen in !scale_denominator! we use that instead
// NOTE 2: The 0.00028 is used in Mapnik (and replicated in pg-mvt) and comes from
// OGC's Styled Layer Descriptor Implementation Specification
const gridResolution = ctx => {
    const minimumResolution = webmercator.getResolution({ z: 38 });
    return `${256 / ctx.res} * GREATEST(!scale_denominator! * 0.00028, ${minimumResolution})::double precision`;
};

// SQL query to extract the boundaries of the area to be aggregated and the grid resolution
// cdb_{x-y}{min_max} return the limits of the tile. Aggregations do [min, max) in both axis
// cdb_res: Aggregation resolution (as specified by gridResolution)
// cdb_point_bbox: Tile bounding box [min, max]
const gridInfoQuery = ctx => {
    return `
    SELECT
        cdb_xmin,
        cdb_ymin,
        cdb_xmax,
        cdb_ymax,
        cdb_res,
        ST_MakeEnvelope(cdb_xmin, cdb_ymin, cdb_xmax, cdb_ymax, 3857) AS cdb_point_bbox
    FROM
    (
        SELECT
            cdb_res,
            CEIL (ST_XMIN(cdb_full_bbox) / cdb_res) * cdb_res AS cdb_xmin,
            FLOOR(ST_XMAX(cdb_full_bbox) / cdb_res) * cdb_res AS cdb_xmax,
            CEIL (ST_YMIN(cdb_full_bbox) / cdb_res) * cdb_res AS cdb_ymin,
            FLOOR(ST_YMAX(cdb_full_bbox) / cdb_res) * cdb_res AS cdb_ymax
        FROM
        (
            SELECT
                ${gridResolution(ctx)} AS cdb_res,
                !bbox! cdb_full_bbox
        ) _cdb_input_resources
    ) _cdb_grid_bbox_margins
`;
};

// Function to generate the resulting point for a cell from the aggregated data
const aggregatedPointWebMercator = (ctx) => {
    switch (ctx.placement) {
    // For centroid, we return the average of the cell
    case 'centroid':
        return ', ST_SetSRID(ST_MakePoint(AVG(cdb_x), AVG(cdb_y)), 3857) AS the_geom_webmercator';

        // Middle point of the cell
    case 'point-grid':
        return ', ST_SetSRID(ST_MakePoint(cdb_pos_grid_x, cdb_pos_grid_y), 3857) AS the_geom_webmercator';

        // For point-sample we'll get a single point directly from the source
        // If it's default aggregation we'll add the extra columns to keep backwards compatibility
    case 'point-sample':
        return '';

    default:
        throw new Error(`Invalid aggregation placement "${ctx.placement}"`);
    }
};

// Function to generate the resulting point for a cell from the a join with the source
const aggregatedPointJoin = (ctx) => {
    switch (ctx.placement) {
    case 'centroid':
        return '';
    case 'point-grid':
        return '';
    // For point-sample we'll get a single point directly from the source
    // If it's default aggregation we'll add the extra columns to keep backwards compatibility
    case 'point-sample':
        return `
            NATURAL JOIN
            (
                SELECT ${ctx.isDefaultAggregation ? '*' : 'cartodb_id, the_geom_webmercator'}
                FROM
                (
                    ${ctx.sourceQuery}
                ) __cdb_src_query
            ) __cdb_query_columns
        `;
    default:
        throw new Error(`Invalid aggregation placement "${ctx.placement}"`);
    }
};

// Function to generate the values common to all points in a cell
// By default we use the cell number (which is fast), but for point-grid we
// get the coordinates of the mid point so we don't need to calculate them later
// which requires extra data in the group by clause
const aggregatedPosCoordinate = (ctx, coordinate) => {
    switch (ctx.placement) {
    // For point-grid we return the coordinate of the middle point of the grid
    case 'point-grid':
        return `(FLOOR(cdb_${coordinate} / __cdb_grid_params.cdb_res) + 0.5) * __cdb_grid_params.cdb_res`;

        // For other, we return the cell position (relative to the world)
    default:
        return `FLOOR(cdb_${coordinate} / __cdb_grid_params.cdb_res)`;
    }
};

const aggregationQueryTemplate = ctx => `
WITH __cdb_grid_params AS
(
    ${gridInfoQuery(ctx)}
)
SELECT * FROM
(
    SELECT
        min(cartodb_id) as cartodb_id
        ${aggregatedPointWebMercator(ctx)}
        ${dimensionDefs(ctx)}
        ${aggregateColumnDefs(ctx)}
    FROM
    (
        SELECT
            *,
            ${aggregatedPosCoordinate(ctx, 'x')} as cdb_pos_grid_x,
            ${aggregatedPosCoordinate(ctx, 'y')} as cdb_pos_grid_y
        FROM
        (
            SELECT
                __cdb_src_query.*,
                ST_X(the_geom_webmercator) cdb_x,
                ST_Y(the_geom_webmercator) cdb_y
            FROM
            (
                ${ctx.sourceQuery}
            ) __cdb_src_query, __cdb_grid_params
            WHERE the_geom_webmercator && cdb_point_bbox
            OFFSET 0
        ) __cdb_src_get_x_y, __cdb_grid_params
        WHERE cdb_x < __cdb_grid_params.cdb_xmax AND cdb_y < __cdb_grid_params.cdb_ymax
    ) __cdb_src_gridded
    GROUP BY cdb_pos_grid_x, cdb_pos_grid_y ${dimensionNames(ctx)}
    ${havingClause(ctx)}
) __cdb_aggregation_src
${aggregatedPointJoin(ctx)}
`;

module.exports.SUPPORTED_PLACEMENTS = ['centroid', 'point-grid', 'point-sample'];
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
    res: 256 / options.resolution
});
