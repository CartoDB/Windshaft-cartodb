'use strict';

const windshaftUtils = require('windshaft').utils;

module.exports.extractTableNames = function (query) {
    return [
        'SELECT * FROM CDB_QueryTablesText($windshaft$',
        substituteDummyTokens(query),
        '$windshaft$) as tablenames'
    ].join('');
};

module.exports.getQueryActualRowCount = function (query) {
    return `select COUNT(*) AS rows FROM (${substituteDummyTokens(query)}) AS __cdb_query`;
};

function getQueryRowEstimation(query) {
    return 'select CDB_EstimateRowCount($windshaft$' + substituteDummyTokens(query) + '$windshaft$) as rows';
}
module.exports.getQueryRowEstimation = getQueryRowEstimation;

function getQueryGeometryType(query, geometryColumn) {
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
module.exports.columnCastTpl = function columnCastTpl(ctx) {
    return `date_part('epoch', ${ctx.column})`;
};

/** If the column type is float, ignore any non numeric result (infinity / NaN) */
module.exports.handleFloatColumn = function handleFloatColumn(ctx) {
    return `${!ctx.isFloatColumn ? `${ctx.column}` :
        `nullif(nullif(nullif(${ctx.column}, 'infinity'::float), '-infinity'::float), 'NaN'::float)`
    }`;
};

/** Count NULL appearances */
module.exports.countNULLs = function countNULLs(ctx) {
    return `sum(CASE WHEN (${ctx.column} IS NULL) THEN 1 ELSE 0 END)`;
};

/** Count only infinity (positive and negative) appearances */
module.exports.countInfinites = function countInfinites(ctx) {
    return `${!ctx.isFloatColumn ? '0' :
        `sum(CASE WHEN (${ctx.column} = 'infinity'::float OR ${ctx.column} = '-infinity'::float) THEN 1 ELSE 0 END)`
    }`;
};

/** Count only NaNs appearances*/
module.exports.countNaNs = function countNaNs(ctx) {
    return `${!ctx.isFloatColumn ? '0' :
        `sum(CASE WHEN (${ctx.column} = 'NaN'::float) THEN 1 ELSE 0 END)`
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

function columnSelector(columns) {
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

module.exports.getQuerySample = function (query, sampleProb, limit = null, randomSeed = 0.5, columns = null) {
    const singleTable = simpleQueryTable(query);
    if (singleTable) {
        return getTableSample(singleTable.table, columns || singleTable.columns, sampleProb, limit, randomSeed);
    }
    const limitClause = limit ? `LIMIT ${limit}` : '';
    return `
        WITH __cdb_rndseed AS (
            SELECT setseed(${randomSeed})
        )
        SELECT ${columnSelector(columns)}
            FROM (${substituteDummyTokens(query)}) AS __cdb_query
            WHERE random() < ${sampleProb}
            ${limitClause}
    `;
};

function getTableSample(table, columns, sampleProb, limit = null, randomSeed = 0.5) {
    const limitClause = limit ? `LIMIT ${limit}` : '';
    sampleProb *= 100;
    randomSeed *= Math.pow(2, 31) - 1;
    return `
        SELECT ${columnSelector(columns)}
        FROM ${table}
        TABLESAMPLE BERNOULLI (${sampleProb}) REPEATABLE (${randomSeed}) ${limitClause}
    `;
}

function simpleQueryTable(sql) {
    const basicQuery =
        /\s*SELECT\s+([\*a-z0-9_,\s]+?)\s+FROM\s+((\"[^"]+\"|[a-z0-9_]+)\.)?(\"[^"]+\"|[a-z0-9_]+)\s*;?\s*/i;
    const unwrappedQuery = new RegExp('^' + basicQuery.source + '$', 'i');
    // queries for named maps are wrapped like this:
    var wrappedQuery = new RegExp(
        '^\\s*SELECT\\s+\\*\\s+FROM\\s+\\(' +
        basicQuery.source +
        '\\)\\s+AS\\s+wrapped_query\\s+WHERE\\s+\\d+=1\\s*$',
        'i'
    );
    let match = sql.match(unwrappedQuery);
    if (!match) {
        match = sql.match(wrappedQuery);
    }
    if (match) {
        const columns = match[1];
        const schema = match[3];
        const table = match[4];
        return { table: schema ? `${schema}.${table}` : table, columns };
    }
    return false;
}

module.exports.getMaxMinColumnQuery = function (query, column = 'cartodb_id') {
    return `
        SELECT
            min(${column}) AS min_id,
            max(${column}) AS max_id,
            (max(${column}) - min(${column})) AS id_span
        FROM (${query}) _cdb_metadata_max_min;
    `;
};

module.exports.getSampleFromIdsQuery = function (query, ids, columns, column = 'cartodb_id') {
    return `
        SELECT
            ${columnSelector(columns)}
        FROM (${query}) _cdb_metadata_sample
        WHERE ${column} IN (${ids.join(',')})
    `;
};

function getQueryLimited(query, limit = 0) {
    return `
        SELECT *
            FROM (${substituteDummyTokens(query)}) AS __cdb_query
            LIMIT ${limit}
    `;
}

function queryPromise(dbConnection, query) {
    return new Promise((resolve, reject) => {
      dbConnection.query(query, (err, res) => err ? reject(err) : resolve(res));
    });
}

function substituteDummyTokens(sql) {
    return subsituteTokensForZoom(sql, 0);
}

function subsituteTokensForZoom(sql, zoom) {
    if (!sql) {
        return undefined;
    }
    const affectedTableRegexCache = {
        bbox: /!bbox!/g,
        scale_denominator: /!scale_denominator!/g,
        pixel_width: /!pixel_width!/g,
        pixel_height: /!pixel_height!/g
    };

    const webmercator = new windshaftUtils.WebMercatorHelper();
    const resolution = webmercator.getResolution({ z : zoom });
    const scaleDenominator = resolution.dividedBy(0.00028);
    // We always use the whole world as the bbox
    const extent = webmercator.getExtent({ x : 0, y : 0, z : 0 });

    return sql
        .replace(affectedTableRegexCache.bbox,
                 `ST_MakeEnvelope(${extent.xmin}, ${extent.ymin}, ${extent.xmax}, ${extent.ymax}, 3857)`)
        .replace(affectedTableRegexCache.scale_denominator, scaleDenominator)
        .replace(affectedTableRegexCache.pixel_width, resolution)
        .replace(affectedTableRegexCache.pixel_height, resolution);
}

module.exports.queryPromise = queryPromise;
module.exports.getQueryLimited = getQueryLimited;
module.exports.substituteDummyTokens = substituteDummyTokens;
module.exports.subsituteTokensForZoom = subsituteTokensForZoom;
