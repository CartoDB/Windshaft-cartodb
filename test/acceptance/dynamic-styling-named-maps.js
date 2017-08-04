var assert = require('../support/assert');
var step = require('step');
var LayergroupToken = require('../../lib/cartodb/models/layergroup-token');
var testHelper = require(__dirname + '/../support/test_helper');
var CartodbWindshaft = require(__dirname + '/../../lib/cartodb/server');
var serverOptions = require(__dirname + '/../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);

describe('dynamic styling for named maps', function() {

    var keysToDelete;

    beforeEach(function() {
        keysToDelete = {};
    });

    afterEach(function(done) {
        testHelper.deleteRedisKeys(keysToDelete, done);
    });

    var templateId = 'dynamic-styling-template-1';

    var template = {
        version: '0.0.1',
        name: templateId,
        auth: { method: 'open' },
        placeholders: {
            color: {
                type: "css_color",
                default: "Reds"
            }
        },
        layergroup:  {
            version: '1.0.0',
            layers: [{
                options: {
                    sql: 'SELECT * FROM test_table',
                    cartocss: [
                        '#layer {',
                        '  marker-fill: #000;',
                        '}'
                    ].join('\n'),
                    cartocss_version: '2.0.2'
                }
            }, {
                options: {
                    sql: 'SELECT * FROM test_table',
                    cartocss: [
                        '#layer {',
                        '  marker-fill: #000;',
                        '}'
                    ].join('\n'),
                    cartocss_version: '2.0.2'
                }
            }, {
                options: {
                    sql: 'SELECT * FROM test_table',
                    cartocss: [
                        '#layer {',
                        '  marker-fill: #000;',
                        '}'
                    ].join('\n'),
                    cartocss_version: '2.0.2'
                }
            }]
        }
    };

    var templateParams = {
        styles: {
            0: [
                '#layer {',
                '  marker-fill: #fabada;',
                '}'
            ].join('\n'),
            2: [
                '#layer {',
                '  marker-fill: #cebada;',
                '}'
            ].join('\n')
        }
    };

    it('should instantiate a template applying cartocss dynamicly', function (done) {
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
            function instantiateTemplate(err) {
                assert.ifError(err);

                var next = this;
                assert.response(server, {
                    url: '/api/v1/map/named/' + templateId,
                    method: 'POST',
                    headers: {
                        host: 'localhost',
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify(templateParams)
                }, {},
                function (res, err) {
                    return next(err, res);
                });
            },
            function checkInstanciation(err, res) {
                assert.ifError(err);

                assert.equal(res.statusCode, 200);

                var parsedBody = JSON.parse(res.body);

                keysToDelete['map_cfg|' + LayergroupToken.parse(parsedBody.layergroupid).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;

                assert.equal(parsedBody.metadata.layers[0].meta.cartocss, templateParams.styles['0']);
                assert.equal(
                    parsedBody.metadata.layers[1].meta.cartocss,
                    template.layergroup.layers[1].options.cartocss
                );
                assert.equal(parsedBody.metadata.layers[2].meta.cartocss, templateParams.styles['2']);

                return parsedBody.layergroupid;
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
