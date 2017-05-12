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
--   '{"minx": -20037508.3, "minx": 20037508.29613578, "maxx": -20037508.29613578, "maxy": 20037508.3 }',
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
DECLARE
  minx double precision;
  maxx double precision;
  miny double precision;
  maxy double precision;
  conds text;
  aggr_columns text;
  filter_conds text;
BEGIN
  -- zoom_level will be used to choose the spatial aggregation granularity

  -- Fallback to regular dataset/PostGIS

  minx := bbox->'minx';
  maxx := bbox->'maxx';
  miny := bbox->'miny';
  maxy := bbox->'maxy';

  conds := Format(
    'the_geom_webmercator && ST_MakeEnvelope(%1$s,%2$s,%3$s,%4$s)',
    minx, miny, maxx, maxy
  );

  -- TODO: add other filters to conds
  filter_conds := '1 = 1';

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
  tt_table::regclass::text, aggr_columns, filter_conds);
END;
$$ LANGUAGE PLPGSQL;
