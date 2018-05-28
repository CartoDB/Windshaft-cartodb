function prepareQuery(sql) {
  var affectedTableRegexCache = {
      bbox: /!bbox!/g,
      scale_denominator: /!scale_denominator!/g,
      pixel_width: /!pixel_width!/g,
      pixel_height: /!pixel_height!/g
  };

  return sql
      .replace(affectedTableRegexCache.bbox, 'ST_MakeEnvelope(0,0,0,0)')
      .replace(affectedTableRegexCache.scale_denominator, '0')
      .replace(affectedTableRegexCache.pixel_width, '1')
      .replace(affectedTableRegexCache.pixel_height, '1');
}

module.exports.extractTableNames = function extractTableNames(query) {
    return [
        'SELECT * FROM CDB_QueryTablesText($windshaft$',
        prepareQuery(query),
        '$windshaft$) as tablenames'
    ].join('');
};

module.exports.getQueryActualRowCount = function (query) {
    return `select COUNT(*) AS rows FROM (${query}) AS __cdb_query`;
};

function getQueryRowEstimation(query) {
    return 'select CDB_EstimateRowCount($windshaft$' + query + '$windshaft$) as rows';
}

module.exports.getQueryRowEstimation = getQueryRowEstimation;

module.exports.getAggregationMetadata = ctx => `
    WITH
    rowEstimation AS (
        ${getQueryRowEstimation(ctx.query)}
    ),
    geometryType AS (
        SELECT ST_GeometryType(${ctx.geometryColumn}) as geom_type
        FROM (${ctx.query}) AS __cdb_query WHERE ${ctx.geometryColumn} IS NOT NULL LIMIT 1
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
module.exports.countNULLs= function countNULLs(ctx) {
    return `sum(CASE WHEN (${ctx.column} IS NULL) THEN 1 ELSE 0 END)`;
};

/** Count only infinity (positive and negative) appearances */
module.exports.countInfinites = function countInfinites(ctx) {
    return `${!ctx.isFloatColumn ? `0` :
        `sum(CASE WHEN (${ctx.column} = 'infinity'::float OR ${ctx.column} = '-infinity'::float) THEN 1 ELSE 0 END)`
    }`;
};

/** Count only NaNs appearances*/
module.exports.countNaNs = function countNaNs(ctx) {
    return `${!ctx.isFloatColumn ? `0` :
        `sum(CASE WHEN (${ctx.column} = 'NaN'::float) THEN 1 ELSE 0 END)`
    }`;
};

module.exports.getQueryTopCategories = function(query, column, topN, includeNulls=false) {
    const where = includeNulls ? '' : `WHERE ${column} IS NOT NULL`;
    return `
        SELECT ${column} AS category, COUNT(*) AS frequency
        FROM (${query}) AS __cdb_query
        ${where}
        GROUP BY ${column} ORDER BY 2 DESC
        LIMIT ${topN}
    `;
};

function columnSelector(columns) {
    if (!columns) {
        return '*';
    }
    if (typeof(columns) === 'string') {
        return columns;
    }
    return columns.map(name => `"${name}"`).join(', ');
}

module.exports.getQuerySample = function(query, sampleProb, limit = null, randomSeed = 0.5, columns = null) {
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
            FROM (${query}) AS __cdb_query
            WHERE random() < ${sampleProb}
            ${limitClause}
    `;
};

function getTableSample(table, columns, sampleProb, limit = null, randomSeed = 0.5) {
    const limitClause = limit ? `LIMIT ${limit}` : '';
    sampleProb *= 100;
    randomSeed *= Math.pow(2, 31) -1;
    return `
        SELECT ${columnSelector(columns)}
        FROM ${table}
        TABLESAMPLE BERNOULLI (${sampleProb}) REPEATABLE (${randomSeed}) ${limitClause}
    `;
}

function simpleQueryTable(sql) {
    const basicQuery =
        /\s*SELECT\s+([\*a-z0-9_,\s]+?)\s+FROM\s+((\"[^"]+\"|[a-z0-9_]+)\.)?(\"[^"]+\"|[a-z0-9_]+)\s*;?\s*/i;
    const unwrappedQuery = new RegExp("^"+basicQuery.source+"$", 'i');
    // queries for named maps are wrapped like this:
    var wrappedQuery = new RegExp(
        "^\\s*SELECT\\s+\\*\\s+FROM\\s+\\(" +
        basicQuery.source +
        "\\)\\s+AS\\s+wrapped_query\\s+WHERE\\s+\\d+=1\\s*$",
        'i'
    );
    let match = sql.match(unwrappedQuery);
    if (!match) {
        match = sql.match(wrappedQuery);
    }
    if (match) {
        const columns = match[1];
        const schema = match[3];
        const table  = match[4];
        return { table: schema ? `${schema}.${table}` : table, columns };
    }
    return false;
}

module.exports.getQueryGeometryType = function(query, geometryColumn) {
    return `
        SELECT ST_GeometryType(${geometryColumn}) AS geom_type
            FROM (${query}) AS __cdb_query
            WHERE ${geometryColumn} IS NOT NULL
            LIMIT 1
    `;
};

module.exports.getQueryLimited = function(query, limit=0) {
    return `
        SELECT *
            FROM (${query}) AS __cdb_query
            LIMIT ${limit}
    `;
};
