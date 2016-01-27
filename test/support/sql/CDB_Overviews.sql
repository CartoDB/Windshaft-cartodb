-- Mockup for CDB_Overviews
CREATE OR REPLACE FUNCTION CDB_Overviews(table_names regclass[])
RETURNS TABLE(base_table regclass, z integer, overview_table regclass)
AS $$
  BEGIN
    IF (SELECT 'test_table_overviews'::regclass = ANY (table_names)) THEN
      RETURN QUERY
        SELECT 'test_table_overviews'::regclass AS base_table, 1 AS z, '_vovw_1_test_table_overviews'::regclass AS overview_table
        UNION ALL
        SELECT 'test_table_overviews'::regclass AS base_table, 2 AS z, '_vovw_2_test_table_overviews'::regclass AS overview_table;
    ELSE
      RETURN;
    END IF;
  END
$$ LANGUAGE PLPGSQL;

CREATE OR REPLACE FUNCTION CDB_ZoomFromScale(scaleDenominator numeric) RETURNS int AS $$
BEGIN
  RETURN 0;
END
$$ LANGUAGE plpgsql IMMUTABLE;
