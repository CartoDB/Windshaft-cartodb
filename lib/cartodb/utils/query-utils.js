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

function getQueryRowEstimation(query) {
    return 'select CDB_EstimateRowCount(\'' + query + '\') as rows';
}
module.exports.getQueryRowCount = getQueryRowEstimation;

module.exports.getAggregationMetadata = ctx => `
    WITH
    rowEstimation AS (
        ${getQueryRowEstimation(ctx.query)}
    ),
    geometryType AS (
        SELECT ST_GeometryType(the_geom) as geom_type
        FROM (${ctx.query}) AS __cdb_query WHERE the_geom IS NOT NULL LIMIT 1
    )
    SELECT
        rows AS count,
        geom_type AS type
    FROM rowEstimation, geometryType;
`;
