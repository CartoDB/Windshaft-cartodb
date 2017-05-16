-- WIP TT SQL query functions using directly accessible tables (e.g. FDW tables)
-- Using a connection to the external DB will require plpython implementation

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
  minx := bbox->'minx';
  maxx := bbox->'maxx';
  miny := bbox->'miny';
  maxy := bbox->'maxy';

  -- TODO compute dx, dy, dt (group by dt only if t in filters?)

  conditions := Format(
    'x BETWEEN %1$s AND %3$s AND y BETWEEN %2$s AND %4$s',
    minx, minx, maxx, maxy
  );

  WITH filter_conds AS (
    SELECT CASE (filter->'type')::text
    WHEN 'range' THEN
      Format('%1$s BETWEEN %2$s AND %3$s', filter->'column', filter->'min', filter->'max')
    WHEN 'category' THEN
      -- TODO: handle reject
      Format('%1$s IN (%2$s)', filter->'column', filter->'accept', filter->'reject')
    END AS filter_def FROM unnest(filters) as filter
  ) SELECT string_agg(filter_conds.filter_def, ' AND ') FROM filter_conds INTO filter_conditions;

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

-- Tile data implementation for a TT table with quadtree index and time t
-- using QT extension: https://gist.github.com/jgoizueta/bd111fe377f0dc85762685350cc4dfd8
CREATE OR REPLACE FUNCTION _tt_q_TileData(tt_table TEXT, bbox JSON, filters JSON[], aggregations JSON[], zoom_level INT)
RETURNS SETOF RECORD
AS $$
DECLARE
  minx double precision;
  maxx double precision;
  miny double precision;
  maxy double precision;
  spatial_conditions text;
  aggr_columns text;
  conditions text;
  max_qt_level INT;
  aggr_qt_level INT;
BEGIN

  minx := bbox->'minx';
  maxx := bbox->'maxx';
  miny := bbox->'miny';
  maxy := bbox->'maxy';

  -- compute quad level, dt (group by dt only if t in filters?)
  -- compute min_q, max_q fo quad_level; gq is truncated quad
  -- compute also gt (groupbing time), but only if time in filters?

  -- TODO: select max selection level using zoom
  max_qt_level := zoom;

  WITH tiles AS (
    SELECT
      qt_first(qt_code) AS qt_min, qt_last(qt_code) AS qt_max
     FROM qt_intersecting_tiles(BOX2D(minx, miny, maxx, maxy), max_level)
  ), tile_filters AS (
    SELECT Format(
      '(qt BETWEEN %1$s AND %2$s)',
      tiles.qt_min, tiles.qt_max
    ) AS cond FROM tiles
  )
  SELECT string_agg(cols.col_def, ',') FROM tile_filters.cond INTO conditions;

  WITH filter_conds AS (
    SELECT CASE (filter->'type')::text
    WHEN 'range' THEN
      Format('%1$s BETWEEN %2$s AND %3$s', filter->'column', filter->'min', filter->'max')
    WHEN 'category' THEN
      -- TODO: handle reject
      Format('%1$s IN (%2$s)', filter->'column', filter->'accept', filter->'reject')
    END AS filter_def FROM unnest(filters) as filter
  ) SELECT string_agg(filter_conds.filter_def, ' AND ') FROM filter_conds INTO filter_conditions;

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
  aggr_qt_level := zoom;

  -- TODO: select time  aggregation level using zoom
  -- TODO avoid t-grouping if no t
  dt := ...;

  EXECUTE Format('
    WITH grouped AS (
      SELECT
        %2$s,
        qt_qt_apply_prefix_mask(qt, qt_prefix_mask(%$1s)) AS qt,
        Floor(t/%2$s)::int AS gt,
        gq, gt, $(columns) FROM ...
      GROUP BY
        qt_qt_apply_prefix_mask(qt, qt_prefix_mask(%$1s)),
        ROUND(...gt
        FROM %1$s f
        WHERE %6$s -- HAVING? separate handling of t conditions?

      WHERE/HAVING? filters --separate behaviour for time?
    )
    SELECT
      ... AS cartodb_id,
      qt_center(qt, %$1s) AS the_geom_webmercator,
      ... t
      ... aggregated columns
  ', aggr_qt_level, aggr_columns);

END;
$$ LANGUAGE PLPGSQL;
