//Remove this file when Auth fallback is not used anymore
// AUTH_FALLBACK

const assert = require('../../support/assert');
const testHelper = require('../../support/test_helper');
const CartodbWindshaft = require('../../../lib/cartodb/server');
const serverOptions = require('../../../lib/cartodb/server_options');
var LayergroupToken = require('../../../lib/cartodb/models/layergroup-token');

function singleLayergroupConfig(sql, cartocss) {
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

function createRequest(layergroup, userHost, apiKey) {
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
var pointSqlMaster = "select * from test_table_private_1";
var pointSqlPublic = "select * from test_table";
var keysToDelete;

describe('authorization fallback', function () {
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

    it("succeed with master", function (done) {
        var layergroup = singleLayergroupConfig(pointSqlMaster, '#layer { marker-fill:red; }');

        assert.response(server,
            createRequest(layergroup, 'user_previous_to_project_auth', '4444'),
            {
                status: 200
            },
            function (res, err) {
                assert.ifError(err);

                var parsed = JSON.parse(res.body);
                assert.ok(parsed.layergroupid);
                assert.equal(res.headers['x-layergroup-id'], parsed.layergroupid);

                keysToDelete['map_cfg|' + LayergroupToken.parse(parsed.layergroupid).token] = 0;
                keysToDelete['user:user_previous_to_project_auth:mapviews:global'] = 5;

                done();
            }
        );
    });


    it("succeed with default - sending default_public", function (done) {
        var layergroup = singleLayergroupConfig(pointSqlPublic, '#layer { marker-fill:red; }');

        assert.response(server,
            createRequest(layergroup, 'user_previous_to_project_auth', 'default_public'),
            {
                status: 200
            },
            function (res, err) {
                assert.ifError(err);

                var parsed = JSON.parse(res.body);
                assert.ok(parsed.layergroupid);
                assert.equal(res.headers['x-layergroup-id'], parsed.layergroupid);

                keysToDelete['map_cfg|' + LayergroupToken.parse(parsed.layergroupid).token] = 0;
                keysToDelete['user:user_previous_to_project_auth:mapviews:global'] = 5;

                done();
            }
        );
    });

    it("succeed with default - sending no api key token", function (done) {
        var layergroup = singleLayergroupConfig(pointSqlPublic, '#layer { marker-fill:red; }');

        assert.response(server,
            createRequest(layergroup, 'user_previous_to_project_auth'),
            {
                status: 200
            },
            function (res, err) {
                assert.ifError(err);

                var parsed = JSON.parse(res.body);
                assert.ok(parsed.layergroupid);
                assert.equal(res.headers['x-layergroup-id'], parsed.layergroupid);

                keysToDelete['map_cfg|' + LayergroupToken.parse(parsed.layergroupid).token] = 0;
                keysToDelete['user:user_previous_to_project_auth:mapviews:global'] = 5;

                done();
            }
        );
    });

    it("succeed with non-existent api key - defaults to default", function (done) {
        var layergroup = singleLayergroupConfig(pointSqlPublic, '#layer { marker-fill:red; }');

        assert.response(server,
            createRequest(layergroup, 'user_previous_to_project_auth', 'THIS-API-KEY-DOESNT-EXIST'),
            {
                status: 200
            },
            function (res, err) {
                assert.ifError(err);

                var parsed = JSON.parse(res.body);
                assert.ok(parsed.layergroupid);
                assert.equal(res.headers['x-layergroup-id'], parsed.layergroupid);

                keysToDelete['map_cfg|' + LayergroupToken.parse(parsed.layergroupid).token] = 0;
                keysToDelete['user:user_previous_to_project_auth:mapviews:global'] = 5;

                done();
            }
        );
    });

    it("fail with default", function (done) {
        var layergroup = singleLayergroupConfig(pointSqlMaster, '#layer { marker-fill:red; }');

        assert.response(server,
            createRequest(layergroup, 'user_previous_to_project_auth', 'default_public'),
            {
                status: 403
            },
            function (res, err) {
                assert.ifError(err);

                done();
            }
        );
    });

    it("fail with non-existent api key - defaults to default", function (done) {
        var layergroup = singleLayergroupConfig(pointSqlMaster, '#layer { marker-fill:red; }');

        assert.response(server,
            createRequest(layergroup, 'user_previous_to_project_auth', 'THIS-API-KEY-DOESNT-EXIST'),
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
