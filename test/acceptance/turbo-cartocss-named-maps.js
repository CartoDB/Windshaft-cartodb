var assert = require('../support/assert');
var step = require('step');
var LayergroupToken = require('../../lib/cartodb/models/layergroup_token');
var testHelper = require(__dirname + '/../support/test_helper');
var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/server');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);

describe('turbo-cartocss for named maps', function() {

    var keysToDelete;

    beforeEach(function() {
        keysToDelete = {};
    });

    afterEach(function(done) {
        testHelper.deleteRedisKeys(keysToDelete, done);
    });

    var expectedCartocss = [
        '#layer {',
        '  marker-allow-overlap:true;',
        '  marker-fill:#fee5d9;',
        '  [ price > 10.25 ] {  marker-fill:#fcae91}',
        '  [ price > 10.75 ] {  marker-fill:#fb6a4a}',
        '  [ price > 11.5 ] {  marker-fill:#de2d26}',
        '  [ price > 16.5 ] {  marker-fill:#a50f15}',
        '}'
    ].join('');

    var templateId = 'turbo-cartocss-template-1';

    var template = {
        version: '0.0.1',
        name: templateId,
        auth: { method: 'open' },
        layergroup:  {
            version: '1.0.0',
                layers: [{
                    options: {
                        sql: [
                            'SELECT test_table.*, _prices.price FROM test_table JOIN (' +
                            '  SELECT 1 AS cartodb_id, 10.00 AS price',
                            '  UNION',
                            '  SELECT 2, 10.50',
                            '  UNION',
                            '  SELECT 3, 11.00',
                            '  UNION',
                            '  SELECT 4, 12.00',
                            '  UNION',
                            '  SELECT 5, 21.00',
                            ') _prices ON _prices.cartodb_id = test_table.cartodb_id'
                        ].join('\n'),
                        cartocss: [
                            '#layer {' +
                            '  marker-fill: ramp([price], colorbrewer(Reds));' +
                            '  marker-allow-overlap:true;' +
                            '}'
                        ].join(''),
                        cartocss_version: '2.0.2'
                    }
                }
            ]
        }
    };

    var layergroup =  {
        version: '1.3.0',
        layers: [{
            type: 'named',
            options: {
                name: templateId,
            }
        }]
    };

    it('should create a template with turbo-cartocss parsed properly', function (done) {
        step(
            function postTemplate() {
                var next = this;

                assert.response(server, {
                    url: '/api/v1/map/named?api_key=1234',
                    method: 'POST',
                    headers: { host: 'localhost', 'Content-Type': 'application/json' },
                    data: JSON.stringify(template)
                }, {},
                function (res, err) {
                    next(err, res);
                });
            },
            function checkTemplate(err, res) {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                assert.deepEqual(JSON.parse(res.body), {
                    template_id: templateId
                });

                return null;
            },
            function createLayergroup(err) {
                assert.ifError(err);

                var next = this;

                assert.response(server, {
                    url: '/api/v1/map',
                    method: 'POST',
                    headers: { host: 'localhost', 'Content-Type': 'application/json' },
                    data: JSON.stringify(layergroup)
                }, {},
                function (res, err) {
                    next(err, res);
                });
            },
            function checkLayergroup(err, res) {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);

                var parsedBody = JSON.parse(res.body);

                keysToDelete['map_cfg|' + LayergroupToken.parse(parsedBody.layergroupid).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;

                assert.ok(parsedBody.layergroupid);
                assert.ok(parsedBody.last_updated);
                assert.deepEqual(parsedBody.metadata.layers[0].meta.cartocss, expectedCartocss);

                return parsedBody.layergroupid;
            },
            function requestTile(err, layergroupId) {
                assert.ifError(err);

                var next = this;

                assert.response(server, {
                    url: '/api/v1/map/' + layergroupId + '/0/0/0.png',
                    method: 'GET',
                    headers: { host: 'localhost' },
                    encoding: 'binary'
                }, {},
                function(res, err) {
                    next(err, res);
                });
            },
            function checkTile(err, res) {
                assert.ifError(err);

                assert.equal(res.statusCode, 200);
                assert.equal(res.headers['content-type'], 'image/png');

                testHelper.checkCache(res);

                return null;
            },
            function deleteTemplate(err) {
                assert.ifError(err);

                var next = this;

                assert.response(server, {
                    url: '/api/v1/map/named/' + templateId + '?api_key=1234',
                    method: 'DELETE',
                    headers: { host: 'localhost' }
                }, {}, function (res, err) {
                    next(err, res);
                });
            },
            function checkDeleteTemplate(err, res) {
                assert.ifError(err);
                assert.equal(res.statusCode, 204);
                assert.ok(!res.body);

                return null;
            },
            function finish(err) {
                done(err);
            }
        );
    });
});
