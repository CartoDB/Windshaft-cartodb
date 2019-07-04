'use strict';

require('../../support/test_helper');

const assert = require('../../support/assert');
const TestClient = require('../../support/test-client');

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;
const FIVE_MINUTES_IN_SECONDS = 60 * 5;

const defaultLayers = [{
    type: 'cartodb',
    options: {
        sql: TestClient.SQL.ONE_POINT,
        cartocss: TestClient.CARTOCSS.POINTS,
        cartocss_version: '2.3.0'
    }
}];

function createMapConfig (layers = defaultLayers) {
    return {
        version: '1.8.0',
        layers: layers
    };
}

describe('cache-control header', function () {
    describe('max-age directive', function () {
        it('tile from a table wich is included in cdb_tablemetada', function (done) {
            const ttl = ONE_YEAR_IN_SECONDS;
            const mapConfig = createMapConfig([{
                type: 'cartodb',
                options: {
                    sql: 'select * from test_table',
                    cartocss: TestClient.CARTOCSS.POINTS,
                    cartocss_version: '2.3.0'
                }
            }]);

            const testClient = new TestClient(mapConfig);

            testClient.getTile(0, 0, 0, {}, function (err, res) {
                if (err) {
                    return done(err);
                }

                assert.equal(res.headers['cache-control'], `public,max-age=${ttl}`);
                testClient.drain(done);
            });
        });

        it('tile from a table wich is NOT included in cdb_tablemetada', function (done) {
            const ttl = global.environment.varnish.fallbackTtl || FIVE_MINUTES_IN_SECONDS;
            const mapConfig = createMapConfig([{
                type: 'cartodb',
                options: {
                    sql: 'select * from test_table_2',
                    cartocss: TestClient.CARTOCSS.POINTS,
                    cartocss_version: '2.3.0'
                }
            }]);

            const testClient = new TestClient(mapConfig);

            testClient.getTile(0, 0, 0, {}, function (err, res) {
                if (err) {
                    return done(err);
                }

                assert.equal(res.headers['cache-control'], `public,max-age=${ttl}`);
                testClient.drain(done);
            });
        });

        it('tile from joined tables which one of them is NOT included in cdb_tablemetada', function (done) {
            const ttl = global.environment.varnish.fallbackTtl || FIVE_MINUTES_IN_SECONDS;
            const mapConfig = createMapConfig([{
                type: 'cartodb',
                options: {
                    sql: `
                        select
                            t.cartodb_id,
                            t.the_geom,
                            t.the_geom_webmercator
                        from
                            test_table t,
                            test_table_2 t2
                        where
                            t.cartodb_id = t2.cartodb_id
                    `,
                    cartocss: TestClient.CARTOCSS.POINTS,
                    cartocss_version: '2.3.0'
                }
            }]);

            const testClient = new TestClient(mapConfig);

            testClient.getTile(0, 0, 0, {}, function (err, res) {
                if (err) {
                    return done(err);
                }

                assert.equal(res.headers['cache-control'], `public,max-age=${ttl}`);
                testClient.drain(done);
            });
        });

        it('tile from a dynamic query which doesn\'t use a table' , function (done) {
            const ttl = ONE_YEAR_IN_SECONDS;
            const mapConfig = createMapConfig();

            const testClient = new TestClient(mapConfig);

            testClient.getTile(0, 0, 0, {}, function (err, res) {
                if (err) {
                    return done(err);
                }

                assert.equal(res.headers['cache-control'], `public,max-age=${ttl}`);
                testClient.drain(done);
            });
        });
    });
});
