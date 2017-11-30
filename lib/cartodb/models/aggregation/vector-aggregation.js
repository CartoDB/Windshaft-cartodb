const BaseAggregation = require('./base-aggregation');
const { baseQueryTemplate } = BaseAggregation;

module.exports = class VectorAggregation extends BaseAggregation {
    sql (options) {
        return vectorAggregationQueryTemplate({
            source_query: options.sql,
            res: options.resolution,
            columns: options.columns
        });
    }
};

const vectorAggregationQueryTemplate = ctx => `
    WITH
    _cdb_source AS (
    -- original query
    ${ctx.source_query}
    ),
    _cdb_resolution AS (
    SELECT ${ctx.res}*CDB_XYZ_Resolution(CDB_ZoomFromScale(!scale_denominator!))
    AS _cdb_grid_size
    -- equivalent to:
    --   ${ctx.res}*!scale_denominator!*0.00028
    ),
    _cdb_gridded AS (
    SELECT
    Floor(ST_X(_cdb_source.the_geom_webmercator)/_cdb_grid_size)::int AS _cdb_gx,
    Floor(ST_Y(_cdb_source.the_geom_webmercator)/_cdb_grid_size)::int AS _cdb_gy,
    count(*) AS _cdb_feature_count
    FROM _cdb_source, _cdb_resolution
    GROUP BY _cdb_gx, _cdb_gy
    ),
    _cdb_webmercator AS (
    SELECT
        row_number() over() AS cartodb_id,
        _cdb_feature_count,
        ST_SetSRID(
        ST_MakePoint(
            _cdb_gx*_cdb_grid_size + _cdb_grid_size/2,
            _cdb_gy*_cdb_grid_size + _cdb_grid_size/2
        ),
        3857
        ) AS the_geom_webmercator
    FROM _cdb_gridded, _cdb_resolution
    )
    SELECT
    cartodb_id,
    ST_Transform(the_geom_webmercator, 4326) AS the_geom,
    the_geom_webmercator,
    _cdb_feature_count
    FROM _cdb_webmercator
    ${baseQueryTemplate(ctx)}
`;
