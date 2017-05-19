
-- required extensions plpythonu, postgis
-- pip install python-quadkey # https://github.com/CartoDB/python-quadkey

-- TODO: set function attributes properly (IMMUTABLE, STABLE, VOLATILE, STRICT, ...)

CREATE OR REPLACE FUNCTION qk_bbox(quadint BIGINT, zoom INT, srid INT DEFAULT 3857)
RETURNS BOX2D
AS $$
  import quadkey
  if srid == 3857:
    source_srid = srid
    xmin, ymin, xmax, ymax = quadkey.tile2bbox_webmercator(quadint, zoom)
  else:
    source_srid = 4326
    xmin, ymin, xmax, ymax = quadkey.tile2bbox(quadint, zoom)

  if source_srid == srid:
    return "BOX(%.16g %.16g, %.16g %.16g)" % (xmin, ymin, xmax, ymax)
  else:
    box_query = "ST_SetSRID(ST_MakeEnvelope($1, $2, $3, $4),$5)"
    parameter_types = ["double precision", "double precision", "double precision", "double precision", "integer"]
    parameter_values = [xmin, ymin, xmax, ymax, source_srid]
    if source_srid != srid:
      box_query = "ST_Transform({0}, $6)".format(box_query)
      parameter_types.append("integer")
      parameter_values.append(srid)

    plan = plpy.prepare("SELECT BOX2D({0}) AS qk_bbox;".format(box_query), parameter_types)
    return plpy.execute(plan, parameter_values, 1)[0]['qk_bbox']
$$ language 'plpythonu';

CREATE OR REPLACE FUNCTION qk_area(zoom INT, srid INT DEFAULT 3857)
RETURNS DOUBLE PRECISION LANGUAGE SQL
AS $$
  SELECT ST_Area(qk_bbox(0, zoom, srid));
$$;

CREATE OR REPLACE FUNCTION qk_bbox_geometry(quadint BIGINT, zoom INT, srid INT DEFAULT 3857)
RETURNS GEOMETRY LANGUAGE SQL
AS $$
  SELECT ST_SetSRID(qk_bbox(quadint, zoom, srid), srid);
$$;

CREATE OR REPLACE FUNCTION qk_children(quadint BIGINT, zoom INT)
RETURNS TABLE(qk_code BIGINT, qk_level INT) AS $$
  import quadkey
  children = quadkey.tile_children(quadint, zoom)
  if children:
    return  map(lambda qi: [qi, zoom+1], children)
  else:
    return []
$$ language 'plpythonu';

CREATE OR REPLACE FUNCTION qk_prefix_mask(zoom INT)
RETURNS BIGINT
AS $$
  import quadkey
  return quadkey.tile_mask(zoom)
$$ language 'plpythonu';

CREATE OR REPLACE FUNCTION qk_apply_prefix_mask(quadint BIGINT, zoom INT)
RETURNS BIGINT
LANGUAGE SQL
AS $$
  SELECT quadint & qk_prefix_mask(zoom);
$$;

CREATE OR REPLACE FUNCTION qk_center(quadint BIGINT, zoom INT, srid INT DEFAULT 3857)
RETURNS GEOMETRY
AS $$
  import quadkey
  if srid == 3857:
    source_srid = srid
    x, y = quadkey.tile_center_webmercator(quadint, zoom)
  else:
    source_srid = 4326
    x, y = quadkey.tile_center(quadint, zoom)

  if source_srid == srid:
    return "SRID=%d;POINT(%.16g %.16g)" % (source_srid, x, y)
  else:
    box_query = "ST_SetSRID(ST_MakePoint($1, $2),$3)"
    parameter_types = ["double precision", "double precision", "integer"]
    parameter_values = [x, y, source_srid]
    if source_srid != srid:
      box_query = "ST_Transform({0}, $4)".format(box_query)
      parameter_types.append("integer")
      parameter_values.append(srid)

    plan = plpy.prepare("SELECT {0} AS qk_center;".format(box_query), parameter_types)
    return plpy.execute(plan, parameter_values, 1)[0]['qk_center']
$$ language 'plpythonu';


CREATE OR REPLACE FUNCTION qk_code_from_point(point GEOMETRY)
RETURNS BIGINT
LANGUAGE SQL
AS $$
  SELECT qk_code_from_xy(ST_X(point), ST_Y(point), COALESCE(NULLIF(ST_SRID(point), 0), 3857));
$$;

CREATE OR REPLACE FUNCTION qk_code_from_xy(x DOUBLE PRECISION, y DOUBLE PRECISION, srid INT DEFAULT 3857)
RETURNS BIGINT
AS $$
  import quadkey

  input_srid = srid
  input_x = x
  input_y = y

  plpy.notice('x:{0} y:{1}, srid:{2}', x, y, srid)

  if input_srid != 3587 and input_srid != 4326:
    point_sql = "ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), $3), $4)"
    xy_sql = "SELECT ST_X({0}) AS x, ST_Y({0}) AS y".format(point_sql)
    plan = plpy.prepare(xy_sql, ["double precision", "double precision", "integer", "integer"])
    result = plpy.execute(plan, [x, y, input_srid, 3857], 1)[0]
    input_x = result['x']
    input_y = result['y']
    input_srid = 3857

  plpy.notice('-> x:{0} y:{1}, srid:{2}', input_x, input_y, input_srid)

  if input_srid == 3857:
    qk = quadkey.webmercator2quadint(input_x, input_y)
  else:
    qk = quadkey.lonlat2quadint(input_x, input_y)

  return qk
$$ language 'plpythonu';

CREATE OR REPLACE FUNCTION qk_range(quadint BIGINT, zoom INT, OUT min_qk_code BIGINT, OUT max_qk_code BIGINT)
AS $$
  import quadkey
  return quadkey.tile2range(quadint, zoom)
$$ language 'plpythonu';


CREATE OR REPLACE FUNCTION qk_code_from_xyz(x INTEGER, y INTEGER, z INTEGER)
RETURNS BIGINT
AS $$
  import quadkey
  return quadkey.xyz2quadint(x, y, z)
$$ language 'plpythonu';

CREATE OR REPLACE FUNCTION qk_code_to_xyz(quadint BIGINT, zoom INT, OUT x INTEGER, OUT y INTEGER, OUT z INTEGER)
AS $$
  import quadkey
  return quadkey.tile2xyz(quadint, zoom)
$$ language 'plpythonu';
