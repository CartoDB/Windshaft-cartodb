-- Mockup for CDB_Overviews
CREATE OR REPLACE FUNCTION CDB_Overviews(table_name text)
RETURNS TABLE(z integer, overview_table text)
AS $$
  BEGIN
    IF table_name = 'test_table_overviews' THEN
      RETURN QUERY
        SELECT 1 AS z, 'test_table_overviews_ov1'::text AS overviw_table
        UNION ALL
        SELECT 2 AS z, 'test_table_overviews_ov2'::text AS overviw_table;
    ELSE
      RETURN;
    END IF;
  END
$$ LANGUAGE PLPGSQL;
