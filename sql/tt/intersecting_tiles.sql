
CREATE OR REPLACE FUNCTION _qk_intersecting_tile(qk_code_ BIGINT, qk_level_ INT, aoi GEOMETRY, max_level INT)
RETURNS TABLE(qk_code BIGINT, qk_level INT, complete BOOLEAN)
AS $$
BEGIN
  -- TODO: if ST_SRID(aoi) is not 3587, either transform it or pass the srid argument to qk_bbox
  IF ST_Intersects(qk_bbox_geometry(qk_code_, qk_level_), aoi) THEN
    IF ST_Contains(aoi, qk_bbox_geometry(qk_code_, qk_level_)) THEN
      RETURN QUERY SELECT qk_code_, qk_level_, 't'::boolean;
    ELSE
      IF qk_level_ = max_level THEN
        IF ST_Area(ST_Intersection(aoi, qk_bbox_geometry(qk_code_, qk_level_))) > 0.5*qk_area(qk_level_) THEN
          RETURN QUERY SELECT qk_code_, qk_level_, 't'::boolean;
        ELSE
          -- Empty Result (this tile is dismissed)
        END IF;
      ELSE
        -- The complete='f' column indicates that this whole tile should not be added to the result,
        -- but children tiles inside it should be examined.
        RETURN QUERY SELECT qk_code_, qk_level_, 'f'::boolean;
      END IF;
    END IF;
  ELSE
    -- Empty Result  (this tile is dismissed)
  END IF;
END;
$$ LANGUAGE PLPGSQL;

-- if max_level is not high enough result may be empty (tiles too coarse to represent the area)
CREATE OR REPLACE FUNCTION qk_intersecting_tiles(aoi GEOMETRY, max_level INT)
RETURNS TABLE(qk_code BIGINT, qk_level INT)
AS $$
BEGIN
  RETURN QUERY

    WITH RECURSIVE seltiles(qk_code, qk_level, complete) AS (
        -- TODO: optimize by starting at z0 and the set of tiles intersecting aoi's bbox
        -- z0 = log2(l0/l); l = min(width, height of aoi's ext); l0 = tile 0 size
        -- initial set can be computed as in https://github.com/CartoDB/bi_postgresql/blob/master/src/quadkey.sql#L164
        -- this could be equivalent or similar to https://github.com/CartoDB/cartodb-postgresql/blob/master/scripts-available/CDB_Overviews.sql#L152-L175
        SELECT * FROM _qk_intersecting_tile(0, 0,  aoi, max_level)
        UNION (
          WITH tc AS (
            SELECT (children).* FROM (
              SELECT qk_children(st0.qk_code, st0.qk_level) children from seltiles as st0
                WHERE NOT st0.complete AND st0.qk_level < max_level
            ) children_wrapper
          )
          SELECT (_qk_intersecting_tile(tc.qk_code, tc.qk_level,  aoi, max_level)).*
            FROM tc
        )
    )
    SELECT seltiles.qk_code, seltiles.qk_level FROM seltiles WHERE complete;
END;
$$ LANGUAGE PLPGSQL;
