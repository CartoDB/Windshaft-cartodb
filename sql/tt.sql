-- bbox : (in webmercator coordinates)
-- { "minx": -20037508.3, "minx": 20037508.29613578,
--   "maxx": -20037508.29613578, "maxy": 20037508.3,3857 }
--
-- filters : (range and category filters)
--    "type": "range", "column": "value", min: 10, "max": 100
--    "type": "category", "column": "value", "accept": ["1"], "reject": ["2"]
--
-- aggregations : columns to be aggregated and how
-- [ { "aggregate_function": "sum", "aggregate_column": "value", "type": "real" } ]
-- valid aggregate functions: 'avg', 'count', 'max', 'min', 'sum'
--
-- Return columns:
-- cartodb_id unique row identifier
-- the_geom_webmercator geometry (point)
-- one column for each aggregation, named with the "aggregate_column" name and with "type"
--
-- Example of use:
--
-- SELECT * FROM TT_TileData(
--   'tttable',
--   '{"minx": -20037508.3, "miny": 20037508.29613578, "maxx": -20037508.29613578, "maxy": 20037508.3 }',
--   ARRAY['{"type":"category", "column":"value3", "accept":["xx"]}']::json[],
--   ARRAY['{"aggregate_function":"sum", "aggregate_column":"value1", "type":"numeric"}',
--         '{"aggregate_function":"avg", "aggregate_column":"value2", "type":"numeric"}' ],
--   10
-- ) AS tiledata(
--   cartodb_id int,
--   the_geom_webmercator geometry,
--   value1 numeric,
--   value2 numeric
-- );
--
CREATE OR REPLACE FUNCTION TT_TileData(tt_table TEXT, bbox JSON, filters JSON[], aggregations JSON[], zoom_level INT)
RETURNS SETOF RECORD
AS $$
BEGIN
  -- Fallback to regular dataset/PostGIS
  RETURN _table_TileData(tt_table, bbox, filters, aggregations, zoom_level);
END;
$$ LANGUAGE PLPGSQL;

-- Get data for regular table
-- zoom_level is not used, since there's no data aggregation here; results are exact
CREATE OR REPLACE FUNCTION _table_TileData(tt_table TEXT, bbox JSON, filters JSON[], aggregations JSON[], zoom_level INT)
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
BEGIN
  minx := bbox->>0;
  maxx := bbox->>2;
  miny := bbox->>1;
  maxy := bbox->>3;

  conditions := Format(
    'the_geom_webmercator && ST_MakeEnvelope(%1$s,%2$s,%3$s,%4$s)',
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
      '%2$s::%3$s',
      aggr->'aggregate_function',
      aggr->'aggregate_column',
      aggr->'type'
    ) AS col_def FROM unnest(aggregations) as aggr
  ) SELECT string_agg(cols.col_def, ',') FROM cols INTO aggr_columns;

  RETURN QUERY EXECUTE Format('
    SELECT
      cartodb_id,
      the_geom_webmercator,
      %2$s
    FROM %1$s
    WHERE %3$s;',
  tt_table::regclass::text, aggr_columns, conditions);
END;
$$ LANGUAGE PLPGSQL;

