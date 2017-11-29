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

module.exports.getQueryRowCount = function getQueryRowEstimation(query) {
    return 'select CDB_EstimateRowCount(\'' + query + '\') as rows';
};

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