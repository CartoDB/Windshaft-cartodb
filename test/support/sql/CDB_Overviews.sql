-- Mockup for CDB_Overviews
CREATE OR REPLACE FUNCTION CDB_Overviews(table_name regclass)
RETURNS TABLE(z integer, overview_table regclass)
AS $$
  BEGIN
    IF table_name::text = 'test_table_overviews' THEN
      RETURN QUERY
        SELECT 1 AS z, 'test_table_overviews_ov1'::regclass AS overviw_table
        UNION ALL
        SELECT 2 AS z, 'test_table_overviews_ov2'::regclass AS overviw_table;
    ELSE
      RETURN;
    END IF;
  END
$$ LANGUAGE PLPGSQL;
