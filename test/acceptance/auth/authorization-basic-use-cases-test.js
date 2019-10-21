'use strict';

const assert = require('../../support/assert');
const testHelper = require('../../support/test-helper');
const CartodbWindshaft = require('../../../lib/server');
const serverOptions = require('../../../lib/server-options');
var LayergroupToken = require('../../../lib/models/layergroup-token');

function singleLayergroupConfig (sql, cartocss) {
    return {
        version: '1.7.0',
        layers: [
            {
                type: 'mapnik',
                options: {
                    sql: sql,
                    cartocss: cartocss,
                    cartocss_version: '2.3.0'
                }
            }
        ]
    };
}

function createRequest (layergroup, userHost, apiKey) {
    var url = layergroupUrl;
    if (apiKey) {
        url += '?api_key=' + apiKey;
    }
    return {
        url: url,
        method: 'POST',
        headers: {
            host: userHost || 'localhost',
            'Content-Type': 'application/json'
        },
        data: JSON.stringify(layergroup)
    };
}

var layergroupUrl = '/api/v1/map';
var pointSqlMaster = 'select * from test_table_private_1';
var pointSqlPublic = 'select * from test_table';
var keysToDelete;

describe('Basic authorization use cases', function () {
    var server;

    before(function () {
        server = new CartodbWindshaft(serverOptions);
    });

    beforeEach(function () {
        keysToDelete = {};
    });

    afterEach(function (done) {
        testHelper.deleteRedisKeys(keysToDelete, done);
    });

    it('succeed with master', function (done) {
        var layergroup = singleLayergroupConfig(pointSqlMaster, '#layer { marker-fill:red; }');

        assert.response(server,
            createRequest(layergroup, 'localhost', '1234'),
            {
                status: 200
            },
            function (res, err) {
                assert.ifError(err);

                var parsed = JSON.parse(res.body);
                assert.ok(parsed.layergroupid);
                assert.strictEqual(res.headers['x-layergroup-id'], parsed.layergroupid);

                keysToDelete['map_cfg|' + LayergroupToken.parse(parsed.layergroupid).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;

                done();
            }
        );
    });

    it('succeed with default - sending default_public', function (done) {
        var layergroup = singleLayergroupConfig(pointSqlPublic, '#layer { marker-fill:red; }');

        assert.response(server,
            createRequest(layergroup, 'localhost', 'default_public'),
            {
                status: 200
            },
            function (res, err) {
                assert.ifError(err);

                var parsed = JSON.parse(res.body);
                assert.ok(parsed.layergroupid);
                assert.strictEqual(res.headers['x-layergroup-id'], parsed.layergroupid);

                keysToDelete['map_cfg|' + LayergroupToken.parse(parsed.layergroupid).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;

                done();
            }
        );
    });

    it('fail with non-existent api key', function (done) {
        var layergroup = singleLayergroupConfig(pointSqlPublic, '#layer { marker-fill:red; }');

        assert.response(server,
            createRequest(layergroup, 'localhost', 'THIS-API-KEY-DOESNT-EXIST'),
            {
                status: 401
            },
            function (res, err) {
                assert.ifError(err);
                var parsed = JSON.parse(res.body);
                assert.ok(Object.prototype.hasOwnProperty.call(parsed, 'errors'));
                assert.strictEqual(parsed.errors.length, 1);
                assert.ok(parsed.errors[0].match(/Unauthorized/));
                done();
            }
        );
    });

    it('fail with default', function (done) {
        var layergroup = singleLayergroupConfig(pointSqlMaster, '#layer { marker-fill:red; }');

        assert.response(server,
            createRequest(layergroup, 'localhost', 'default_public'),
            {
                status: 403
            },
            function (res, err) {
                assert.ifError(err);

                done();
            }
        );
    });

    describe('No api key provided - fallback to default_public', function () {
        it('succeed with default - public dataset', function (done) {
            var layergroup = singleLayergroupConfig(pointSqlPublic, '#layer { marker-fill:red; }');

            assert.response(server,
                createRequest(layergroup, 'localhost'),
                {
                    status: 200
                },
                function (res, err) {
                    assert.ifError(err);

                    var parsed = JSON.parse(res.body);
                    assert.ok(parsed.layergroupid);
                    assert.strictEqual(res.headers['x-layergroup-id'], parsed.layergroupid);

                    keysToDelete['map_cfg|' + LayergroupToken.parse(parsed.layergroupid).token] = 0;
                    keysToDelete['user:localhost:mapviews:global'] = 5;

                    done();
                }
            );
        });

        it('fail with default - private dataset', function (done) {
            var layergroup = singleLayergroupConfig(pointSqlMaster, '#layer { marker-fill:red; }');

            assert.response(server,
                createRequest(layergroup, 'localhost'),
                {
                    status: 403
                },
                function (res, err) {
                    assert.ifError(err);

                    done();
                }
            );
        });
    });
});
