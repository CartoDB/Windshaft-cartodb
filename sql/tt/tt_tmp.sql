-- WIP TT SQL query functions using directly accessible tables (e.g. FDW tables)
-- Using a connection to the external DB will require plpython implementation

-- Aggregated TT queries (for rendering)





-- Tile data implementation for a TT table with X, Y coordinaates and time t
CREATE OR REPLACE FUNCTION _tt_xy__TileData(tt_table TEXT, bbox JSON, filters JSON[], aggregations JSON[], zoom_level INT)
RETURNS SETOF RECORD
AS $$
DECLARE
  minx double precision;
  maxx double precision;
  miny double precision;
  maxy double precision;
  conditions text;
  aggr_columns text;
  filter_conditions text;
  dx double precision;
  dy double precision;
  dt double precision;
BEGIN
  minx := bbox->>0;
  maxx := bbox->>2;
  miny := bbox->>1;
  maxy := bbox->>3;

  -- TODO compute dx, dy, dt (group by dt only if t in filters?)



  conditions := Format(
    'x BETWEEN %1$s AND %3$s AND y BETWEEN %2$s AND %4$s',
    minx, minx, maxx, maxy
  );

  -- compute filters
  filter_conditions := _tt_filter_conditions(filters);

  IF NOT (filter_conditions = '') THEN
    conditions := conditions || ' AND ' || filter_conditions;
  END IF;

  WITH cols AS (
    SELECT Format(
      '%1$s(%2$s)::%3$s AS %2$s',
      aggr->'aggregate_function',
      aggr->'aggregate_column',
      aggr->'type'
    ) AS col_def FROM unnest(aggregations) as aggr
  ) SELECT string_agg(cols.col_def, ',') FROM cols INTO aggr_columns;

  EXECUTE Format('
    WITH grouped AS (
      SELECT
        %5$s
        count(*) AS n,
        Floor(x/%2$s)::int AS gx,
        Floor(y/%3$s)::int AS gy,
        Floor(t/%4$s)::int AS gt,
        MIN(cartodb_id) AS cartodb_id
      FROM %1$s f
      WHERE %6$s -- HAVING? separate handling of t conditions?
      GROUP BY gx, gy
    )
    SELECT
      cartodb_id,
      -- TODO: ST_POINT(x, y) from gx, gy, t from gt
      -- TODO: aggregated column names
    FROM grouped
  ', tt_table, dx, dy, dt, aggr_columns, conditions, columns, schema_name);
END;
$$ LANGUAGE PLPGSQL;

-- Tile data implementation for a TT table with quadkey index and time t
-- using QK extension: https://gist.github.com/jgoizueta/bd111fe377f0dc85762685350cc4dfd8
CREATE OR REPLACE FUNCTION _tt_qk_TileData(tt_table TEXT, bbox JSON, filters JSON[], aggregations JSON[], zoom_level INT)
RETURNS SETOF RECORD
AS $$
DECLARE
  minx double precision;
  maxx double precision;
  miny double precision;
  maxy double precision;
  filter_conditions text;
  spatial_conditions text;
  aggr_columns text;
  conditions text;
  max_qk_level INT;
  aggr_qk_level INT;
  filter_level INT;
  group_level INT;
BEGIN
  minx := bbox->>0;
  maxx := bbox->>2;
  miny := bbox->>1;
  maxy := bbox->>3;

  -- set both filtering and grouping detail to pixel level
  filter_level = zoom_level + 8;
  group_level = zoom_level + 8;
  -- TODO: limit to max level (31)

  -- create spatial filter using quad key ranges; the number of ranges could be large
  -- as an alternative we could query each range separately, then combine the results
  WITH tiles AS (
    SELECT
      qk_first(qk_code) AS qk_min, qk_last(qk_code) AS qk_max
     FROM qk_intersecting_tiles(BOX2D(minx, miny, maxx, maxy), filter_level)
  ), tile_filters AS (
    SELECT Format(
      '(qk BETWEEN %1$s AND %2$s)',
      tiles.qk_min, tiles.qk_max
    ) AS cond FROM tiles
  )
  SELECT string_agg(cols.col_def, ',') FROM tile_filters.cond INTO conditions;

  -- compute filters
  filter_conditions := _tt_filter_conditions(filters);

  IF NOT (filter_conditions = '') THEN
    conditions := conditions || ' AND ' || filter_conditions;
  END IF;

  WITH cols AS (
    SELECT Format(
      '%1$s(%2$s)::%3$s AS %2$s',
      aggr->'aggregate_function',
      aggr->'aggregate_column',
      aggr->'type'
    ) AS col_def FROM unnest(aggregations) as aggr
  ) SELECT string_agg(cols.col_def, ',') FROM cols INTO aggr_columns;

  -- TODO: select aggregation level using zoom
  aggr_qk_level := zoom;

  -- TODO: select time  aggregation level using zoom
  -- TODO avoid t-grouping if no t
  -- dt := ...;

  EXECUTE Format('
    WITH grouped AS (
      SELECT
        %2$s,
        qk_qk_apply_prefix_mask(qk, qk_prefix_mask(%$1s)) AS qk,
        Floor(t/%2$s)::int AS gt,
        gq, gt, $(columns) FROM ...
      GROUP BY
        qk_apply_prefix_mask(qk, qk_prefix_mask(%$1s)),
        ROUND(...gt
        FROM %1$s f
        WHERE %6$s -- HAVING? separate handling of t conditions?

      WHERE/HAVING? filters --separate behaviour for time?
    )
    SELECT
      ... AS cartodb_id,
      qk_center(qk, %$1s) AS the_geom_webmercator,
      ... t
      ... aggregated columns
  ', aggr_qk_level, aggr_columns);

END;
$$ LANGUAGE PLPGSQL;
