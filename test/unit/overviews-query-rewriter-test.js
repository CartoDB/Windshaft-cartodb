'use strict';

require('../support/test-helper');

var assert = require('assert');
var OverviewsQueryRewriter = require('../../lib/utils/overviews-query-rewriter');
var overviewsQueryRewriter = new OverviewsQueryRewriter({
    zoom_level: 'ZoomLevel()'
});

function normalizeWhitespace (txt) {
    return txt.replace(/\s+/g, ' ').trim();
}

// compare SQL statements ignoring whitespace
function assertSameSql (sql1, sql2) {
    assert.strictEqual(normalizeWhitespace(sql1), normalizeWhitespace(sql2));
}

describe('Overviews query rewriter', function () {
    it('does not alter queries if no overviews data is present', function () {
        var sql = 'SELECT * FROM table1';
        var overviewsSql = overviewsQueryRewriter.query(sql);
        assert.strictEqual(overviewsSql, sql);
        overviewsSql = overviewsQueryRewriter.query(sql, {});
        assert.strictEqual(overviewsSql, sql);
        overviewsSql = overviewsQueryRewriter.query(sql, { overviews: {} });
        assert.strictEqual(overviewsSql, sql);
    });

    it('does not alter queries which don\'t use overviews', function () {
        var sql = 'SELECT * FROM table1';
        var data = {
            overviews: {
                table2: {
                    0: { table: 'table2_ov0' },
                    1: { table: 'table2_ov1' },
                    4: { table: 'table2_ov4' }
                }
            }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data);
        assert.strictEqual(overviewsSql, sql);
    });

    it('generates query with single overview layer for level 0', function () {
        var sql = 'SELECT * FROM table1';
        var data = {
            overviews: {
                table1: {
                    0: { table: 'table1_ov0' }
                }
            }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data);

        var expectedSql = `
            WITH
              _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )
              SELECT * FROM (
                SELECT * FROM table1_ov0, _vovw_scale WHERE _vovw_z = 0
                UNION ALL
                SELECT * FROM table1, _vovw_scale WHERE _vovw_z > 0
              ) AS _vovw_table1
        `;
        assertSameSql(overviewsSql, expectedSql);
    });

    it('generates query with single overview layer for level >0', function () {
        var sql = 'SELECT * FROM table1';
        var data = {
            overviews: {
                table1: {
                    2: { table: 'table1_ov2' }
                }
            }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data);
        var expectedSql = `
            WITH
              _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )
              SELECT * FROM (
                SELECT * FROM table1_ov2, _vovw_scale WHERE _vovw_z <= 2
                UNION ALL
                SELECT * FROM table1, _vovw_scale WHERE _vovw_z > 2
              ) AS _vovw_table1
        `;
        assertSameSql(overviewsSql, expectedSql);
    });

    it('generates query with multiple overview layers for all levels up to N', function () {
        var sql = 'SELECT * FROM table1';
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
        var overviewsSql = overviewsQueryRewriter.query(sql, data);
        var expectedSql = `
            WITH
              _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )
              SELECT * FROM  (
                SELECT * FROM table1_ov0, _vovw_scale WHERE _vovw_z = 0
                UNION ALL
                SELECT * FROM table1_ov1, _vovw_scale WHERE _vovw_z = 1
                UNION ALL
                SELECT * FROM table1_ov2, _vovw_scale WHERE _vovw_z = 2
                UNION ALL
                SELECT * FROM table1_ov3, _vovw_scale WHERE _vovw_z = 3
                UNION ALL
                SELECT * FROM table1, _vovw_scale WHERE _vovw_z > 3
              ) AS _vovw_table1
        `;
        assertSameSql(overviewsSql, expectedSql);
    });

    it('generates query with multiple overview layers for random levels', function () {
        var sql = 'SELECT * FROM table1';
        var data = {
            overviews: {
                table1: {
                    0: { table: 'table1_ov0' },
                    1: { table: 'table1_ov1' },
                    6: { table: 'table1_ov6' }
                }
            }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data);
        var expectedSql = `
            WITH
              _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )
              SELECT * FROM (
                SELECT * FROM table1_ov0, _vovw_scale WHERE _vovw_z = 0
                UNION ALL
                SELECT * FROM table1_ov1, _vovw_scale WHERE _vovw_z = 1
                UNION ALL
                SELECT * FROM table1_ov6, _vovw_scale WHERE _vovw_z > 1 AND _vovw_z <= 6
                UNION ALL
                SELECT * FROM table1, _vovw_scale WHERE _vovw_z > 6
              ) AS _vovw_table1
        `;
        assertSameSql(overviewsSql, expectedSql);
    });

    it('generates query for a table with explicit schema', function () {
        var sql = 'SELECT * FROM public.table1';
        var data = {
            overviews: {
                'public.table1': {
                    2: { table: 'table1_ov2' }
                }
            }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data);
        var expectedSql = `
            WITH
              _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )
              SELECT * FROM (
                SELECT * FROM public.table1_ov2, _vovw_scale WHERE _vovw_z <= 2
                UNION ALL
                SELECT * FROM public.table1, _vovw_scale WHERE _vovw_z > 2
              ) AS _vovw_table1
        `;
        assertSameSql(overviewsSql, expectedSql);
    });

    it('generates query for a table with explicit schema in the overviews info', function () {
        var sql = 'SELECT * FROM public.table1';
        var data = {
            overviews: {
                'public.table1': {
                    2: { table: 'table1_ov2' }
                }
            }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data);
        var expectedSql = `
            WITH
              _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )
              SELECT * FROM (
                SELECT * FROM public.table1_ov2, _vovw_scale WHERE _vovw_z <= 2
                UNION ALL
                SELECT * FROM public.table1, _vovw_scale WHERE _vovw_z > 2
              ) AS _vovw_table1
        `;

        assertSameSql(overviewsSql, expectedSql);
    });

    it('uses schema name from overviews', function () {
        var sql = 'SELECT * FROM public.table1';
        var data = {
            overviews: {
                table1: {
                    schema: 'public',
                    2: { table: 'table1_ov2' }
                }
            }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data);
        var expectedSql = `
            WITH
              _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )
              SELECT * FROM (
                SELECT * FROM table1_ov2, _vovw_scale WHERE _vovw_z <= 2
                UNION ALL
                SELECT * FROM table1, _vovw_scale WHERE _vovw_z > 2
              ) AS _vovw_table1
        `;
        assertSameSql(overviewsSql, expectedSql);
    });

    it('ignores schema name from overviews if not necessary', function () {
        var sql = 'SELECT * FROM table1';
        var data = {
            overviews: {
                table1: {
                    schema: 'public',
                    2: { table: 'table1_ov2' }
                }
            }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data);
        var expectedSql = `
            WITH
              _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )
              SELECT * FROM (
                SELECT * FROM table1_ov2, _vovw_scale WHERE _vovw_z <= 2
                UNION ALL
                SELECT * FROM table1, _vovw_scale WHERE _vovw_z > 2
              ) AS _vovw_table1
        `;
        assertSameSql(overviewsSql, expectedSql);
    });

    it('uses redundant schema information', function () {
        var sql = 'SELECT * FROM public.table1';
        var data = {
            overviews: {
                'public.table1': {
                    schema: 'public',
                    2: { table: 'table1_ov2' }
                }
            }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data);
        var expectedSql = `
            WITH
              _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )
              SELECT * FROM (
                SELECT * FROM public.table1_ov2, _vovw_scale WHERE _vovw_z <= 2
                UNION ALL
                SELECT * FROM public.table1, _vovw_scale WHERE _vovw_z > 2
              ) AS _vovw_table1
        `;
        assertSameSql(overviewsSql, expectedSql);
    });

    it('generates query for a table that needs quoting with explicit schema', function () {
        var sql = 'SELECT * FROM public."table 1"';
        var data = {
            overviews: {
                'public."table 1"': {
                    2: { table: '"table 1_ov2"' }
                }
            }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data);
        var expectedSql = `
            WITH
              _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )
              SELECT * FROM (
                SELECT * FROM public."table 1_ov2", _vovw_scale WHERE _vovw_z <= 2
                UNION ALL
                SELECT * FROM public."table 1", _vovw_scale WHERE _vovw_z > 2
              ) AS "_vovw_table 1"
        `;
        assertSameSql(overviewsSql, expectedSql);
    });

    it('generates query for a table with explicit schema that needs quoting', function () {
        var sql = 'SELECT * FROM "user-1".table1';
        var data = {
            overviews: {
                '"user-1".table1': {
                    2: { table: 'table1_ov2' }
                }
            }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data);
        var expectedSql = `
            WITH
              _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )
              SELECT * FROM (
                SELECT * FROM "user-1".table1_ov2, _vovw_scale WHERE _vovw_z <= 2
                UNION ALL
                SELECT * FROM "user-1".table1, _vovw_scale WHERE _vovw_z > 2
              ) AS _vovw_table1
        `;
        assertSameSql(overviewsSql, expectedSql);
    });

    it('generates query for a table with explicit schema both needing quoting', function () {
        var sql = 'SELECT * FROM "user-1"."table 1"';
        var data = {
            overviews: {
                '"user-1"."table 1"': {
                    2: { table: '"table 1_ov2"' }

                }
            }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data);
        var expectedSql = `
            WITH
              _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )
              SELECT * FROM (
                SELECT * FROM "user-1"."table 1_ov2", _vovw_scale WHERE _vovw_z <= 2
                UNION ALL
                SELECT * FROM "user-1"."table 1", _vovw_scale WHERE _vovw_z > 2
              ) AS "_vovw_table 1"
        `;
        assertSameSql(overviewsSql, expectedSql);
    });

    it('generates query using overviews for queries with selected columns', function () {
        var sql = 'SELECT column1, column2, column3 FROM table1';
        var data = {
            overviews: {
                table1: {
                    2: { table: 'table1_ov2' }
                }
            }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data);
        var expectedSql = `
            WITH
              _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )
              SELECT column1, column2, column3 FROM (
                SELECT * FROM table1_ov2, _vovw_scale WHERE _vovw_z <= 2
                UNION ALL
                SELECT * FROM table1, _vovw_scale WHERE _vovw_z > 2
              ) AS _vovw_table1
        `;
        assertSameSql(overviewsSql, expectedSql);
    });

    it('generates query using overviews for queries with a semicolon', function () {
        var sql = 'SELECT column1, column2, column3 FROM table1;';
        var data = {
            overviews: {
                table1: {
                    2: { table: 'table1_ov2' }
                }
            }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data);

        var expectedSql = `
            WITH
              _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )
              SELECT column1, column2, column3 FROM (
                SELECT * FROM table1_ov2, _vovw_scale WHERE _vovw_z <= 2
                UNION ALL
                SELECT * FROM table1, _vovw_scale WHERE _vovw_z > 2
              ) AS _vovw_table1;
        `;
        assertSameSql(overviewsSql, expectedSql);
    });

    it('generates query using overviews for queries with extra whitespace', function () {
        var sql = '  SELECT  column1,column2,  column3 FROM  table1  ';
        var data = {
            overviews: {
                table1: {
                    2: { table: 'table1_ov2' }
                }
            }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data);
        var expectedSql = `
            WITH
              _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )
              SELECT column1,column2, column3 FROM (
                SELECT * FROM table1_ov2, _vovw_scale WHERE _vovw_z <= 2
                UNION ALL
                SELECT * FROM table1, _vovw_scale WHERE _vovw_z > 2
              ) AS _vovw_table1
        `;
        assertSameSql(overviewsSql, expectedSql);
    });

    it('does not alter queries which have not the simple supported form', function () {
        var sql = "SELECT * FROM table1 WHERE column1='x'";
        var data = {
            overviews: {
                table1: {
                    2: { table: 'table1_ov2' }
                }
            }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data);
        assert.strictEqual(overviewsSql, sql);

        sql = 'SELECT * FROM table1 JOIN table2 ON (table1.col1=table2.col1)';
        overviewsSql = overviewsQueryRewriter.query(sql, data);
        assert.strictEqual(overviewsSql, sql);

        sql = 'SELECT a+b AS c FROM table1';
        overviewsSql = overviewsQueryRewriter.query(sql, data);
        assert.strictEqual(overviewsSql, sql);

        sql = 'SELECT f(a) AS b FROM table1';
        overviewsSql = overviewsQueryRewriter.query(sql, data);
        assert.strictEqual(overviewsSql, sql);

        sql = 'SELECT * FROM table1 AS x';
        overviewsSql = overviewsQueryRewriter.query(sql, data);
        assert.strictEqual(overviewsSql, sql);

        sql = 'WITH a AS (1) SELECT * FROM table1';
        overviewsSql = overviewsQueryRewriter.query(sql, data);
        assert.strictEqual(overviewsSql, sql);

        sql = 'SELECT * FROM table1 WHERE a=1';
        overviewsSql = overviewsQueryRewriter.query(sql, data);
        assert.strictEqual(overviewsSql, sql);

        sql = `
            SELECT table1.* FROM table1
                   JOIN areas ON ST_Intersects(table1.the_geom, areas.the_geom)
                   WHERE areas.name='A'
        `;
        overviewsSql = overviewsQueryRewriter.query(sql, data);
        assert.strictEqual(overviewsSql, sql);

        sql = 'SELECT table1.*, column1, column2, column3 FROM table1';
        overviewsSql = overviewsQueryRewriter.query(sql, data);
        assert.strictEqual(overviewsSql, sql);
    });

    it('generates overviews for wrapped query', function () {
        var sql = 'SELECT * FROM (SELECT * FROM table1) AS wrapped_query WHERE 1=1';
        var data = {
            overviews: {
                table1: {
                    0: { table: 'table1_ov0' },
                    1: { table: 'table1_ov1' },
                    2: { table: 'table1_ov2' }
                }
            }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data);
        var expectedSql = `
            WITH
              _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )
              SELECT * FROM (SELECT * FROM  (
                SELECT * FROM table1_ov0, _vovw_scale WHERE _vovw_z = 0
                UNION ALL
                SELECT * FROM table1_ov1, _vovw_scale WHERE _vovw_z = 1
                UNION ALL
                SELECT * FROM table1_ov2, _vovw_scale WHERE _vovw_z = 2
                UNION ALL
                SELECT * FROM table1, _vovw_scale WHERE _vovw_z > 2
              ) AS _vovw_table1) AS wrapped_query WHERE 1=1
        `;
        assertSameSql(overviewsSql, expectedSql);
    });

    it('generates query for specific Z level', function () {
        var sql = 'SELECT * FROM table1';
        var data = {
            overviews: {
                table1: {
                    0: { table: 'table1_ov0' },
                    2: { table: 'table1_ov2' },
                    3: { table: 'table1_ov3' }
                }
            }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data, { zoom_level: 3 });
        var expectedSql = 'SELECT * FROM table1_ov3';
        assertSameSql(overviewsSql, expectedSql);
    });

    it('generates query for specific nonpresent Z level', function () {
        var sql = 'SELECT * FROM table1';
        var data = {
            overviews: {
                table1: {
                    0: { table: 'table1_ov0' },
                    2: { table: 'table1_ov2' },
                    3: { table: 'table1_ov3' }
                }
            }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data, { zoom_level: 1 });
        var expectedSql = 'SELECT * FROM table1_ov2';
        assertSameSql(overviewsSql, expectedSql);
    });

    it('does not use overviews for specific out-of-range Z level', function () {
        var sql = 'SELECT * FROM table1';
        var data = {
            overviews: {
                table1: {
                    0: { table: 'table1_ov0' },
                    2: { table: 'table1_ov2' },
                    3: { table: 'table1_ov3' }
                }
            }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data, { zoom_level: 4 });
        var expectedSql = 'SELECT * FROM table1';
        assertSameSql(overviewsSql, expectedSql);
    });

    it('generates query with filters', function () {
        var sql = `SELECT ST_Transform(the_geom, 3857) the_geom_webmercator, cartodb_id, name
                   FROM (SELECT *
                   FROM (select * from table1) _analysis_category_filter
                   WHERE name IN ($escape_0$X$escape_0$)) _cdb_analysis_query`;
        var data = {
            overviews: {
                table1: {
                    0: { table: 'table1_ov0' },
                    1: { table: 'table1_ov1' },
                    2: { table: 'table1_ov2' },
                    3: { table: 'table1_ov3' }
                }
            },
            filters: { name_filter: { type: 'category', column: 'name', params: { accept: ['X'] } } },
            unfiltered_query: 'SELECT * FROM table1'
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data);
        var expectedSql = `
            SELECT * FROM (WITH
                _vovw_scale AS ( SELECT ZoomLevel() AS _vovw_z )
                SELECT * FROM  (
                  SELECT * FROM table1_ov0, _vovw_scale WHERE _vovw_z = 0
                  UNION ALL
                  SELECT * FROM table1_ov1, _vovw_scale WHERE _vovw_z = 1
                  UNION ALL
                  SELECT * FROM table1_ov2, _vovw_scale WHERE _vovw_z = 2
                  UNION ALL
                  SELECT * FROM table1_ov3, _vovw_scale WHERE _vovw_z = 3
                  UNION ALL
                  SELECT * FROM table1, _vovw_scale WHERE _vovw_z > 3
                ) AS _vovw_table1) _analysis_category_filter
             WHERE name IN ($escape_0$X$escape_0$)
        `;
        assertSameSql(overviewsSql, expectedSql);
    });

    it('generates query with filters for specific zoom level', function () {
        var sql = `SELECT ST_Transform(the_geom, 3857) the_geom_webmercator, cartodb_id, name
                   FROM (SELECT *
                   FROM (select * from table1) _analysis_category_filter
                   WHERE name IN ($escape_0$X$escape_0$)) _cdb_analysis_query`;
        var data = {
            overviews: {
                table1: {
                    0: { table: 'table1_ov0' },
                    1: { table: 'table1_ov1' },
                    2: { table: 'table1_ov2' },
                    3: { table: 'table1_ov3' }
                }
            },
            filters: { name_filter: { type: 'category', column: 'name', params: { accept: ['X'] } } },
            unfiltered_query: 'SELECT * FROM table1',
            filter_stats: { unfiltered_rows: 1000, filtered_rows: 900 }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data, { zoom_level: 2 });
        var expectedSql = `
            SELECT * FROM (SELECT * FROM table1_ov2) _analysis_category_filter
            WHERE name IN ($escape_0$X$escape_0$)
        `;
        assertSameSql(overviewsSql, expectedSql);
    });

    it('does not generates query with aggressive filtering', function () {
        var sql = `SELECT ST_Transform(the_geom, 3857) the_geom_webmercator, cartodb_id, name
                   FROM (SELECT *
                   FROM (select * from table1) _analysis_category_filter
                   WHERE name IN ($escape_0$X$escape_0$)) _cdb_analysis_query`;
        var data = {
            overviews: {
                table1: {
                    0: { table: 'table1_ov0' },
                    1: { table: 'table1_ov1' },
                    2: { table: 'table1_ov2' },
                    3: { table: 'table1_ov3' }
                }
            },
            filters: { name_filter: { type: 'category', column: 'name', params: { accept: ['X'] } } },
            unfiltered_query: 'SELECT * FROM table1',
            filter_stats: { unfiltered_rows: 1000, filtered_rows: 10 }
        };
        var overviewsSql = overviewsQueryRewriter.query(sql, data);
        assert.strictEqual(overviewsSql, sql);
    });
});
