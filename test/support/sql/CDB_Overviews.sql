-- Mockup for CDB_Overviews
CREATE OR REPLACE FUNCTION CDB_Overviews(table_names regclass[])
RETURNS TABLE(base_table regclass, z integer, overview_table regclass)
AS $$
  BEGIN
    IF (SELECT 'test_table_overviews'::regclass = ANY (table_names)) THEN
      RETURN QUERY
        SELECT 'test_table_overviews'::regclass AS base_table, 1 AS z, 'test_table_overviews_ov1'::regclass AS overviw_table
        UNION ALL
        SELECT 'test_table_overviews'::regclass AS base_table, 2 AS z, 'test_table_overviews_ov2'::regclass AS overviw_table;
    ELSE
      RETURN;
    END IF;
  END
$$ LANGUAGE PLPGSQL;
