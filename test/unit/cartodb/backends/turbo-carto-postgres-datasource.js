var PostgresDatasource = require('../../../../lib/cartodb/backends/turbo-carto-postgres-datasource');
var PSQL = require('cartodb-psql');
var _ = require('underscore');
var assert = require('assert');

describe('turbo-carto-postgres-datasource', function() {

    beforeEach(function () {
        const dbname = _.template(global.environment.postgres_auth_user, { user_id: 1 }) + '_db';
        const dbuser = _.template(global.environment.postgres_auth_user, { user_id: 1 })
        const pass = _.template(global.environment.postgres_auth_pass, { user_id: 1 })
        const psql = new PSQL({
            user: 'postgres',
            dbname: dbname,
            host: global.environment.postgres.host,
            port: global.environment.postgres.port
        });
        const sql =  [
            'SELECT',
            '  null::geometry the_geom_webmercator,',
            '  CASE',
            '    WHEN x % 4 = 0 THEN \'infinity\'::float',
            '    WHEN x % 4 = 1 THEN \'-infinity\'::float',
            '    WHEN x % 4 = 2 THEN \'NaN\'::float',
            '    ELSE x',
            '  END AS values',
            'FROM generate_series(1, 1000) x'
        ].join('\n')
        this.datasource = new PostgresDatasource(psql, sql);
    });

    it('should ignore NaNs and Infinities when computing ramps', function(done) {
       column = 'values';
       buckets = 4;
       method = 'equal';
       this.datasource.getRamp(column, buckets, method, function(err, result) {
           expected_result = {
               ramp: [ 252, 501, 750, 999 ],
               stats: { min_val: 3, max_val: 999, avg_val: 501 },
               strategy: undefined
            };
           assert.deepEqual(result, expected_result);
           done();
       });
    });
});
