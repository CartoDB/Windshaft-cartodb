'use strict';

const SubstitutionTokens = require('cartodb-query-tables').utils.substitutionTokens;
const WebMercatorHelper = require('cartodb-query-tables').utils.webMercatorHelper;

module.exports.getQueryActualRowCount = function (query) {
    return `select COUNT(*) AS rows FROM (${substituteDummyTokens(query)}) AS __cdb_query`;
};

function getQueryRowEstimation (query) {
    return 'select cartodb.CDB_EstimateRowCount($windshaft$' + substituteDummyTokens(query) + '$windshaft$) as rows';
}
module.exports.getQueryRowEstimation = getQueryRowEstimation;

function getQueryGeometryType (query, geometryColumn) {
    return `
        SELECT ST_GeometryType(${geometryColumn}) AS geom_type
            FROM (${substituteDummyTokens(query)}) AS __cdb_query
            WHERE ${geometryColumn} IS NOT NULL
            LIMIT 1
    `;
}
module.exports.getQueryGeometryType = getQueryGeometryType;

module.exports.getAggregationMetadata = ctx => `
    WITH
    rowEstimation AS (
        ${getQueryRowEstimation(ctx.query)}
    ),
    geometryType AS (
        ${getQueryGeometryType(ctx.query, ctx.geometryColumn)}
    )
    SELECT
        rows AS count,
        geom_type AS type
    FROM rowEstimation, geometryType;
`;

/** Cast the column to epoch */
module.exports.columnCastTpl = function columnCastTpl (ctx) {
    return `date_part('epoch', ${ctx.column})`;
};

/** If the column type is float, ignore any non numeric result (infinity / NaN) */
module.exports.handleFloatColumn = function handleFloatColumn (ctx) {
    return `${!ctx.isFloatColumn ? `${ctx.column}`
        : `nullif(nullif(nullif(${ctx.column}, 'infinity'::float), '-infinity'::float), 'NaN'::float)`
    }`;
};

/** Count NULL appearances */
module.exports.countNULLs = function countNULLs (ctx) {
    return `sum(CASE WHEN (${ctx.column} IS NULL) THEN 1 ELSE 0 END)`;
};

/** Count only infinity (positive and negative) appearances */
module.exports.countInfinites = function countInfinites (ctx) {
    return `${!ctx.isFloatColumn ? '0'
        : `sum(CASE WHEN (${ctx.column} = 'infinity'::float OR ${ctx.column} = '-infinity'::float) THEN 1 ELSE 0 END)`
    }`;
};

/** Count only NaNs appearances */
module.exports.countNaNs = function countNaNs (ctx) {
    return `${!ctx.isFloatColumn ? '0'
        : `sum(CASE WHEN (${ctx.column} = 'NaN'::float) THEN 1 ELSE 0 END)`
    }`;
};

module.exports.getQueryTopCategories = function (query, column, topN, includeNulls = false) {
    const where = includeNulls ? '' : `WHERE ${column} IS NOT NULL`;
    return `
        SELECT ${column} AS category, COUNT(*) AS frequency
        FROM (${substituteDummyTokens(query)}) AS __cdb_query
        ${where}
        GROUP BY ${column} ORDER BY 2 DESC
        LIMIT ${topN}
    `;
};

function columnSelector (columns) {
    if (!columns) {
        return '*';
    }
    if (typeof columns === 'string') {
        return columns;
    }
    if (Array.isArray(columns)) {
        return columns.map(name => `"${name}"`).join(', ');
    }
    throw new TypeError(`Bad argument type for columns: ${typeof columns}`);
}

module.exports.getMaxMinSpanColumnQuery = function (query, column = 'cartodb_id') {
    return `
        SELECT
            min(${column}) AS min_id,
            max(${column}) AS max_id,
            (max(${column}) - min(${column})) AS id_span
        FROM (${substituteDummyTokens(query)}) _cdb_metadata_max_min_span;
    `;
};

module.exports.getSampleFromIdsQuery = function (query, ids, columns, column = 'cartodb_id') {
    return `
        SELECT
            ${columnSelector(columns)}
        FROM (${substituteDummyTokens(query)}) _cdb_metadata_sample
        WHERE ${column} IN (${ids.join(',')})
    `;
};

function getQueryLimited (query, limit = 0) {
    return `
        SELECT *
            FROM (${substituteDummyTokens(query)}) AS __cdb_query
            LIMIT ${limit}
    `;
}

function queryPromise (dbConnection, query) {
    return new Promise((resolve, reject) => {
        dbConnection.query(query, (err, res) => err ? reject(err) : resolve(res));
    });
}

function substituteDummyTokens (sql) {
    return SubstitutionTokens.replace(sql);
}

function substituteTokensForZoom (sql, zoom) {
    const extent = new WebMercatorHelper().getExtent({ x: 0, y: 0, z: 0 });
    const bbox = `ST_MakeEnvelope(${extent.xmin}, ${extent.ymin}, ${extent.xmax}, ${extent.ymax}, 3857)`;
    return SubstitutionTokens.replaceXYZ(sql, { z: zoom, bbox: bbox });
}

/**
 * Strips leading and trailing quotes (") from a string
 * @param {String} columnName, e.g. ("cartodb_id")
 * @returns {String}, e.g. (cartodb_id)
 */
module.exports.stripQuotes = function (columnName) {
    const quotedName = columnName.length > 2 && columnName[0] === '"' && columnName[columnName.length - 1] === '"';
    if (quotedName) {
        return columnName.substring(1, columnName.length - 1);
    }
    return columnName;
};

module.exports.queryPromise = queryPromise;
module.exports.getQueryLimited = getQueryLimited;
module.exports.substituteDummyTokens = substituteDummyTokens;
module.exports.substituteTokensForZoom = substituteTokensForZoom;
