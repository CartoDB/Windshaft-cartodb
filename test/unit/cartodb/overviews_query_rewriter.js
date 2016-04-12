require('../../support/test_helper');

var assert           = require('assert');
var OverviewsQueryRewriter = require('../../../lib/cartodb/utils/overviews_query_rewriter');
var overviewsQueryRewriter = new OverviewsQueryRewriter({
  zoom_level: 'ZoomLevel()'
});

function normalize_whitespace(txt) {
  return txt.replace(/\s+/g, " ").trim();
}

// compare SQL statements ignoring whitespace
function assertSameSql(sql1, sql2) {
    assert.equal(normalize_whitespace(sql1), normalize_whitespace(sql2));
}

describe('Overviews query rewriter', function() {

  it('does not alter queries if no overviews data is present', function(done){
    var sql = "SELECT * FROM table1";
    var overviews_sql = overviewsQueryRewriter.query(sql);
    assert.equal(overviews_sql, sql);
    overviews_sql = overviewsQueryRewriter.query(sql, {});
    assert.equal(overviews_sql, sql);
    overviews_sql = overviewsQueryRewriter.query(sql, { overviews: {} });
    assert.equal(overviews_sql, sql);
    done();
  });


  it('does not alter queries which don\'t use overviews', function(done){
    var sql = "SELECT * FROM table1";
    var data = {
        overviews: {
            table2: {
              0: { table: 'table2_ov0' },
              1: { table: 'table2_ov1' },
              4: { table: 'table2_ov4' }
            }
        }
    };
    var overviews_sql = overviewsQueryRewriter.query(sql, data);
    assert.equal(overviews_sql, sql);
    done();
  });

  // jshint multistr:true

  it('generates query with single overview layer for level 0', function(done){
    var sql = "SELECT * FROM table1";
    var data = {
        overviews: {
            table1: {
              0: { table: 'table1_ov0' }
            }
        }
    };
    var overviews_sql = overviewsQueryRewriter.query(sql, data);

    var expected_sql = "\
        WITH\
          _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )\
          SELECT * FROM (\
            SELECT * FROM table1_ov0, _vovw_scale WHERE _vovw_z = 0\
            UNION ALL\
            SELECT *, 1 AS _vovw_count FROM table1, _vovw_scale WHERE _vovw_z > 0\
          ) AS _vovw_table1\
    ";
    assertSameSql(overviews_sql, expected_sql);
    done();
  });

  it('generates query with single overview layer for level >0', function(done){
    var sql = "SELECT * FROM table1";
    var data = {
        overviews: {
            table1: {
              2: { table: 'table1_ov2' }
            }
        }
    };
    var overviews_sql = overviewsQueryRewriter.query(sql, data);
    var expected_sql = "\
        WITH\
          _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )\
          SELECT * FROM (\
            SELECT * FROM table1_ov2, _vovw_scale WHERE _vovw_z <= 2\
            UNION ALL\
            SELECT *, 1 AS _vovw_count FROM table1, _vovw_scale WHERE _vovw_z > 2\
          ) AS _vovw_table1\
    ";
    assertSameSql(overviews_sql, expected_sql);
    done();
  });

  it('generates query with multiple overview layers for all levels up to N', function(done){
    var sql = "SELECT * FROM table1";
    var data = {
        overviews: {
            table1: {
              0: { table: 'table1_ov0' },
              1: { table: 'table1_ov1' },
              2: { table: 'table1_ov2' },
              3: { table: 'table1_ov3' }
            }
        }
    };
    var overviews_sql = overviewsQueryRewriter.query(sql, data);
    var expected_sql = "\
        WITH\
          _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )\
          SELECT * FROM  (\
            SELECT * FROM table1_ov0, _vovw_scale WHERE _vovw_z = 0\
            UNION ALL\
            SELECT * FROM table1_ov1, _vovw_scale WHERE _vovw_z = 1\
            UNION ALL\
            SELECT * FROM table1_ov2, _vovw_scale WHERE _vovw_z = 2\
            UNION ALL\
            SELECT * FROM table1_ov3, _vovw_scale WHERE _vovw_z = 3\
            UNION ALL\
            SELECT *, 1 AS _vovw_count FROM table1, _vovw_scale WHERE _vovw_z > 3\
          ) AS _vovw_table1\
    ";
    assertSameSql(overviews_sql, expected_sql);
    done();
  });

  it('generates query with multiple overview layers for random levels', function(done){
    var sql = "SELECT * FROM table1";
    var data = {
        overviews: {
            table1: {
              0: { table: 'table1_ov0' },
              1: { table: 'table1_ov1' },
              6: { table: 'table1_ov6' }
            }
        }
    };
    var overviews_sql = overviewsQueryRewriter.query(sql, data);
    var expected_sql = "\
        WITH\
          _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )\
          SELECT * FROM (\
            SELECT * FROM table1_ov0, _vovw_scale WHERE _vovw_z = 0\
            UNION ALL\
            SELECT * FROM table1_ov1, _vovw_scale WHERE _vovw_z = 1\
            UNION ALL\
            SELECT * FROM table1_ov6, _vovw_scale WHERE _vovw_z > 1 AND _vovw_z <= 6\
            UNION ALL\
            SELECT *, 1 AS _vovw_count FROM table1, _vovw_scale WHERE _vovw_z > 6\
          ) AS _vovw_table1\
    ";
    assertSameSql(overviews_sql, expected_sql);
    done();
  });

  it('generates query for a table with explicit schema', function(done){
    var sql = "SELECT * FROM public.table1";
    var data = {
        overviews: {
            'public.table1': {
              2: { table: 'table1_ov2' }
            }
        }
    };
    var overviews_sql = overviewsQueryRewriter.query(sql, data);
    var expected_sql = "\
        WITH\
          _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )\
          SELECT * FROM (\
            SELECT * FROM public.table1_ov2, _vovw_scale WHERE _vovw_z <= 2\
            UNION ALL\
            SELECT *, 1 AS _vovw_count FROM public.table1, _vovw_scale WHERE _vovw_z > 2\
          ) AS _vovw_table1\
    ";
    assertSameSql(overviews_sql, expected_sql);
    done();
  });

  it('generates query for a table with explicit schema in the overviews info', function(done){
    var sql = "SELECT * FROM public.table1";
    var data = {
        overviews: {
            'public.table1': {
              2: { table: 'table1_ov2' }
            }
        }
    };
    var overviews_sql = overviewsQueryRewriter.query(sql, data);
    var expected_sql = "\
        WITH\
          _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )\
          SELECT * FROM (\
            SELECT * FROM public.table1_ov2, _vovw_scale WHERE _vovw_z <= 2\
            UNION ALL\
            SELECT *, 1 AS _vovw_count FROM public.table1, _vovw_scale WHERE _vovw_z > 2\
          ) AS _vovw_table1\
    ";
    assertSameSql(overviews_sql, expected_sql);
    done();
  });

  it('generates query for a table that needs quoting with explicit schema', function(done){
    var sql = "SELECT * FROM public.\"table 1\"";
    var data = {
        overviews: {
            'public."table 1"': {
              2: { table: '"table 1_ov2"' }
            }
        }
    };
    var overviews_sql = overviewsQueryRewriter.query(sql, data);
    var expected_sql = "\
        WITH\
          _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )\
          SELECT * FROM (\
            SELECT * FROM public.\"table 1_ov2\", _vovw_scale WHERE _vovw_z <= 2\
            UNION ALL\
            SELECT *, 1 AS _vovw_count FROM public.\"table 1\", _vovw_scale WHERE _vovw_z > 2\
          ) AS \"_vovw_table 1\"\
    ";
    assertSameSql(overviews_sql, expected_sql);
    done();
  });

  it('generates query for a table with explicit schema that needs quoting', function(done){
    var sql = "SELECT * FROM \"user-1\".table1";
    var data = {
        overviews: {
            '"user-1".table1': {
              2: { table: 'table1_ov2' }
            }
        }
    };
    var overviews_sql = overviewsQueryRewriter.query(sql, data);
    var expected_sql = "\
        WITH\
          _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )\
          SELECT * FROM (\
            SELECT * FROM \"user-1\".table1_ov2, _vovw_scale WHERE _vovw_z <= 2\
            UNION ALL\
            SELECT *, 1 AS _vovw_count FROM \"user-1\".table1, _vovw_scale WHERE _vovw_z > 2\
          ) AS _vovw_table1\
    ";
    assertSameSql(overviews_sql, expected_sql);
    done();
  });


  it('generates query for a table with explicit schema both needing quoting', function(done){
    var sql = "SELECT * FROM \"user-1\".\"table 1\"";
    var data = {
        overviews: {
            '"user-1"."table 1"': {
              2: { table: '"table 1_ov2"' }

            }
        }
    };
    var overviews_sql = overviewsQueryRewriter.query(sql, data);
    var expected_sql = "\
        WITH\
          _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )\
          SELECT * FROM (\
            SELECT * FROM \"user-1\".\"table 1_ov2\", _vovw_scale WHERE _vovw_z <= 2\
            UNION ALL\
            SELECT *, 1 AS _vovw_count FROM \"user-1\".\"table 1\", _vovw_scale WHERE _vovw_z > 2\
          ) AS \"_vovw_table 1\"\
    ";
    assertSameSql(overviews_sql, expected_sql);
    done();
  });


  it('generates query using overviews for queries with selected columns', function(done){
    var sql = "SELECT column1, column2, column3 FROM table1";
    var data = {
        overviews: {
            table1: {
              2: { table: 'table1_ov2' }
            }
        }
    };
    var overviews_sql = overviewsQueryRewriter.query(sql, data);
    var expected_sql = "\
        WITH\
          _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )\
          SELECT column1, column2, column3 FROM (\
            SELECT * FROM table1_ov2, _vovw_scale WHERE _vovw_z <= 2\
            UNION ALL\
            SELECT *, 1 AS _vovw_count FROM table1, _vovw_scale WHERE _vovw_z > 2\
          ) AS _vovw_table1\
    ";
    assertSameSql(overviews_sql, expected_sql);
    done();
  });

  it('generates query using overviews for queries with a semicolon', function(done){
    var sql = "SELECT column1, column2, column3 FROM table1;";
    var data = {
        overviews: {
            table1: {
              2: { table: 'table1_ov2' }
            }
        }
    };
    var overviews_sql = overviewsQueryRewriter.query(sql, data);

    var expected_sql = "\
        WITH\
          _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )\
          SELECT column1, column2, column3 FROM (\
            SELECT * FROM table1_ov2, _vovw_scale WHERE _vovw_z <= 2\
            UNION ALL\
            SELECT *, 1 AS _vovw_count FROM table1, _vovw_scale WHERE _vovw_z > 2\
          ) AS _vovw_table1;\
    ";
    assertSameSql(overviews_sql, expected_sql);
    done();
  });

  it('generates query using overviews for queries with extra whitespace', function(done){
    var sql = "  SELECT  column1,column2,  column3 FROM  table1  ";
    var data = {
        overviews: {
            table1: {
              2: { table: 'table1_ov2' }
            }
        }
    };
    var overviews_sql = overviewsQueryRewriter.query(sql, data);
    var expected_sql = "\
        WITH\
          _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )\
          SELECT column1,column2, column3 FROM (\
            SELECT * FROM table1_ov2, _vovw_scale WHERE _vovw_z <= 2\
            UNION ALL\
            SELECT *, 1 AS _vovw_count FROM table1, _vovw_scale WHERE _vovw_z > 2\
          ) AS _vovw_table1\
    ";
    assertSameSql(overviews_sql, expected_sql);
    done();
  });

  it('does not alter queries which have not the simple supported form', function(done){
    var sql = "SELECT * FROM table1 WHERE column1='x'";
    var data = {
        overviews: {
            table1: {
              2: { table: 'table1_ov2' }
            }
        }
    };
    var overviews_sql = overviewsQueryRewriter.query(sql, data);
    assert.equal(overviews_sql, sql);

    sql = "SELECT * FROM table1 JOIN table2 ON (table1.col1=table2.col1)";
    overviews_sql = overviewsQueryRewriter.query(sql, data);
    assert.equal(overviews_sql, sql);

    sql = "SELECT a+b AS c FROM table1";
    overviews_sql = overviewsQueryRewriter.query(sql, data);
    assert.equal(overviews_sql, sql);

    sql = "SELECT f(a) AS b FROM table1";
    overviews_sql = overviewsQueryRewriter.query(sql, data);
    assert.equal(overviews_sql, sql);

    sql = "SELECT * FROM table1 AS x";
    overviews_sql = overviewsQueryRewriter.query(sql, data);
    assert.equal(overviews_sql, sql);

    sql = "WITH a AS (1) SELECT * FROM table1";
    overviews_sql = overviewsQueryRewriter.query(sql, data);
    assert.equal(overviews_sql, sql);

    sql = "SELECT * FROM table1 WHERE a=1";
    overviews_sql = overviewsQueryRewriter.query(sql, data);
    assert.equal(overviews_sql, sql);

    sql = "\
        SELECT table1.* FROM table1 \
               JOIN areas ON ST_Intersects(table1.the_geom, areas.the_geom) \
               WHERE areas.name='A' \
          ";
    overviews_sql = overviewsQueryRewriter.query(sql, data);
    assert.equal(overviews_sql, sql);

    sql = "SELECT table1.*, column1, column2, column3 FROM table1";
    overviews_sql = overviewsQueryRewriter.query(sql, data);
    assert.equal(overviews_sql, sql);

    done();
  });

  it('generates overviews for wrapped query', function(done){
    var sql = "SELECT * FROM (SELECT * FROM table1) AS wrapped_query WHERE 1=1";
    var data = {
        overviews: {
            table1: {
              0: { table: 'table1_ov0' },
              1: { table: 'table1_ov1' },
              2: { table: 'table1_ov2' }
            }
        }
    };
    var overviews_sql = overviewsQueryRewriter.query(sql, data);
    var expected_sql = "\
        WITH\
          _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )\
          SELECT * FROM (SELECT * FROM  (\
            SELECT * FROM table1_ov0, _vovw_scale WHERE _vovw_z = 0\
            UNION ALL\
            SELECT * FROM table1_ov1, _vovw_scale WHERE _vovw_z = 1\
            UNION ALL\
            SELECT * FROM table1_ov2, _vovw_scale WHERE _vovw_z = 2\
            UNION ALL\
            SELECT *, 1 AS _vovw_count FROM table1, _vovw_scale WHERE _vovw_z > 2\
          ) AS _vovw_table1) AS wrapped_query WHERE 1=1\
    ";
    assertSameSql(overviews_sql, expected_sql);
    done();
  });
});
