'use strict';

require('../support/test-helper');

const helper = require('../support/test-helper');
var assert = require('../support/assert');
var mapnik = require('windshaft').mapnik;
var CartodbWindshaft = require('../../lib/server');
var serverOptions = require('../../lib/server-options');

describe('named maps provider cache', function () {
    var server;

    before(function () {
        server = new CartodbWindshaft(serverOptions);
    });

    var username = 'localhost';
    const apikey = 1234;
    var templateName = 'template_with_color';

    var IMAGE_TOLERANCE = 20;

    function createTemplate (color) {
        return {
            version: '0.0.1',
            name: `${templateName}_${color}`,
            auth: {
                method: 'open'
            },
            placeholders: {
                color: {
                    type: 'css_color',
                    default: color
                }
            },
            layergroup: {
                layers: [
                    {
                        type: 'mapnik',
                        options: {
                            sql: 'select * from populated_places_simple_reduced',
                            cartocss: '#layer { marker-fill: <%= color %>; marker-line-color: <%= color %>; }',
                            cartocss_version: '2.3.0'
                        }
                    }
                ]
            }
        };
    }

    function getNamedTile (templateId, options, callback) {
        if (!callback) {
            callback = options;
            options = {};
        }

        var url = '/api/v1/map/named/' + templateId + '/all/' + [0, 0, 0].join('/') + '.png';

        var requestOptions = {
            url: url,
            method: 'GET',
            headers: {
                host: username
            },
            encoding: 'binary'
        };

        var statusCode = options.statusCode || 200;

        var expectedResponse = {
            status: statusCode,
            headers: {
                'Content-Type': statusCode === 200 ? 'image/png' : 'application/json; charset=utf-8'
            }
        };

        assert.response(server, requestOptions, expectedResponse, function (res, err) {
            var img;
            if (res.statusCode === 200) {
                img = mapnik.Image.fromBytes(Buffer.from(res.body, 'binary'));
            }
            return callback(err, res, img);
        });
    }

    function addTemplate (template, callback) {
        const createTemplateRequest = {
            url: `/api/v1/map/named?api_key=${apikey}`,
            method: 'POST',
            headers: {
                host: username,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(template)
        };

        const expectedResponse = {
            status: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            }
        };

        assert.response(server, createTemplateRequest, expectedResponse, (res, err) => {
            let template;

            if (res.statusCode === 200) {
                template = JSON.parse(res.body);
            }

            return callback(err, res, template);
        });
    }

    function deleteTemplate (templateId, callback) {
        const deleteTemplateRequest = {
            url: `/api/v1/map/named/${templateId}?api_key=${apikey}`,
            method: 'DELETE',
            headers: {
                host: 'localhost'
            }
        };

        const expectedResponse = {
            status: 204
        };

        assert.response(server, deleteTemplateRequest, expectedResponse, (res, err) => {
            return callback(err, res);
        });
    }

    function previewFixture (color) {
        return './test/fixtures/provider/populated_places_simple_reduced-' + color + '.png';
    }

    var colors = ['black', 'red', 'green', 'blue'];
    colors.forEach(function (color) {
        it('should return an image estimating its bounds based on dataset', function (done) {
            addTemplate(createTemplate(color), function (err, res, template) {
                if (err) {
                    return done(err);
                }

                getNamedTile(template.template_id, function (err, res, img) {
                    assert.ok(!err);
                    assert.imageIsSimilarToFile(img, previewFixture(color), IMAGE_TOLERANCE, (err) => {
                        assert.ifError(err);

                        const keysToDelete = {};
                        keysToDelete['map_tpl|localhost'] = 0;
                        helper.deleteRedisKeys(keysToDelete, done);
                    });
                });
            });
        });
    });

    it('should fail to use template from named map provider after template deletion', function (done) {
        const color = 'black';
        const templateId = `${templateName}_${color}`;

        addTemplate(createTemplate(color), function (err) {
            assert.ifError(err);

            getNamedTile(templateId, function (err, res, img) {
                assert.ifError(err);

                assert.imageIsSimilarToFile(img, previewFixture(color), IMAGE_TOLERANCE, function (err) {
                    assert.ifError(err);

                    deleteTemplate(templateId, function (err) {
                        assert.ifError(err);

                        getNamedTile(templateId, { statusCode: 404 }, function (err, res) {
                            assert.ifError(err);

                            assert.deepStrictEqual(
                                JSON.parse(res.body).errors,
                                ["Template 'template_with_color_black' of user 'localhost' not found"]
                            );

                            done();
                        });
                    });
                });
            });
        });
    });
});
