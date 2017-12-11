/**
 * Returns template function (function that accepts template parameters and returns a string)
 */
module.exports = (options) => {
    let templateFn = aggregationQueryTemplates[options.placement];
    console.log(options);
    if (!templateFn) {
        throw new Error("Invalid Aggregation placement: '" + options.placement + "'");
    }
    return templateFn;
};

// Notes:
// * ${ctx.res*0.00028/256}*!scale_denominator! is equivalent to ${ctx.res/256}*CDB_XYZ_Resolution(CDB_ZoomFromScale(!scale_denominator!))
// * We need to filter spatially using !bbox! to make the queries efficient because the filter added by Mapnik (wrapping the query)
//   is only applied after the aggregation.
// * This queries are used for rendering and the_geom is omitted in the results for better performance

const aggregationQueryTemplates = {

        'centroid': ctx => `
            WITH _cdb_params AS (
              SELECT
                (${ctx.res*0.00028/256}*!scale_denominator!)::double precision AS res,
                !bbox! AS bbox
            )
            SELECT
              row_number() over() AS cartodb_id,
              ST_SetSRID(
                  ST_MakePoint(
                      AVG(ST_X(_cdb_query.the_geom_webmercator)),
                      AVG(ST_Y(_cdb_query.the_geom_webmercator))
                  ), 3857
              ) AS the_geom_webmercator,
              count(*) AS _cdb_feature_count
            FROM (${ctx.sourceQuery}) _cdb_query, _cdb_params
            WHERE _cdb_query.the_geom_webmercator && _cdb_params.bbox
            GROUP BY Floor(ST_X(_cdb_query.the_geom_webmercator)/_cdb_params.res), Floor(ST_Y(_cdb_query.the_geom_webmercator)/_cdb_params.res)
        `,

        'point-grid': ctx => `
            WITH _cdb_params AS (
              SELECT
                (${ctx.res*0.00028/256}*!scale_denominator!)::double precision AS res,
                !bbox! AS bbox
            ),
            _cdb_clusters AS (
              SELECT
                ST_SetSRID(ST_MakePoint(AVG(ST_X(_cdb_query.the_geom_webmercator)), AVG(ST_Y(_cdb_query.the_geom_webmercator))), 3857) AS the_geom_webmercator,
                Floor(ST_X(_cdb_query.the_geom_webmercator)/_cdb_params.res)::int AS _cdb_gx,
                Floor(ST_Y(_cdb_query.the_geom_webmercator)/_cdb_params.res)::int AS _cdb_gy,
                count(*) AS _cdb_feature_count
                FROM (${ctx.sourceQuery}) _cdb_query, _cdb_params
                WHERE the_geom_webmercator && _cdb_params.bbox
                GROUP BY _cdb_gx, _cdb_gy
            )
            SELECT
              ST_SetSRID(ST_MakePoint(_cdb_gx*(res+0.5), _cdb_gy*(res*0.5)), 3857) AS the_geom_webmercator,
              _cdb_feature_count
              FROM _cdb_clusters, _cdb_params
        `,

        'point-sample-': ctx => `
            WITH _cdb_params AS (
              SELECT
                (${ctx.res*0.00028/256}*!scale_denominator!)::double precision AS res,
                !bbox! AS bbox
            ), _cdb_clusters AS (
              SELECT
                  MIN(cartodb_id) AS cartodb_id,
                  count(*) AS _cdb_feature_count
                  FROM (${ctx.sourceQuery}) _cdb_query, _cdb_params
                  WHERE _cdb_query.the_geom_webmercator && _cdb_params.bbox
                  GROUP BY Floor(ST_X(_cdb_query.the_geom_webmercator)/_cdb_params.res), Floor(ST_Y(_cdb_query.the_geom_webmercator)/_cdb_params.res)
            ) SELECT
              _cdb_clusters.cartodb_id,
              the_geom, the_geom_webmercator,
              _cdb_feature_count
            FROM _cdb_clusters INNER JOIN (${ctx.sourceQuery}) _cdb_query on (_cdb_clusters.cartodb_id = _cdb_query.cartodb_id)
        `

      };
