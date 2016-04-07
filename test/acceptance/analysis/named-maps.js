var assert = require('../../support/assert');
var step = require('step');

//var mapnik = require('windshaft').mapnik;

var helper = require('../../support/test_helper');

var CartodbWindshaft = require('../../../lib/cartodb/server');
var serverOptions = require('../../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);

var LayergroupToken = require('../../../lib/cartodb/models/layergroup_token');

describe('named-maps analysis', function() {

    var IMAGE_TOLERANCE_PER_MIL = 20;

    var username = 'localhost';
    var widgetsTemplateName = 'widgets-template';

    var layergroupid;
    var layergroup;
    var keysToDelete;

    beforeEach(function(done) {
        keysToDelete = {};

        var widgetsTemplate =  {
            version: '0.0.1',
            name: widgetsTemplateName,
            layergroup:  {
                version: '1.5.0',
                layers: [
                    {
                        "type": "cartodb",
                        "options": {
                            "source": {
                                "id": "HEAD"
                            },
                            "cartocss": '#buffer { polygon-fill: red; }',
                            "cartocss_version": "2.3.0"
                        }
                    }
                ],
                analyses: [
                    {
                        "id": "HEAD",
                        "type": "buffer",
                        "params": {
                            "source": {
                                "id": "2570e105-7b37-40d2-bdf4-1af889598745",
                                "type": "source",
                                "params": {
                                    "query": "select * from populated_places_simple_reduced"
                                }
                            },
                            "radio": 50000
                        }
                    }
                ]
            }
        };

        var template_params = {};

        step(
            function createTemplate()
            {
                var next = this;
                assert.response(
                    server,
                    {
                        url: '/api/v1/map/named?api_key=1234',
                        method: 'POST',
                        headers: {
                            host: username,
                            'Content-Type': 'application/json'
                        },
                        data: JSON.stringify(widgetsTemplate)
                    },
                    {
                        status: 200
                    },
                    function(res, err) {
                        next(err, res);
                    }
                );
            },
            function instantiateTemplate(err, res) {
                assert.ifError(err);

                assert.deepEqual(JSON.parse(res.body), { template_id: widgetsTemplateName });
                var next = this;
                assert.response(
                    server,
                    {
                        url: '/api/v1/map/named/' + widgetsTemplateName,
                        method: 'POST',
                        headers: {
                            host: username,
                            'Content-Type': 'application/json'
                        },
                        data: JSON.stringify(template_params)
                    },
                    {
                        status: 200
                    },
                    function(res) {
                        next(null, res);
                    }
                );
            },
            function finish(err, res) {
                assert.ifError(err);

                layergroup = JSON.parse(res.body);
                assert.ok(layergroup.hasOwnProperty('layergroupid'), "Missing 'layergroupid' from: " + res.body);
                layergroupid = layergroup.layergroupid;

                keysToDelete['map_cfg|' + LayergroupToken.parse(layergroup.layergroupid).token] = 0;
                keysToDelete['user:localhost:mapviews:global'] = 5;

                return done();
            }
        );

    });

    afterEach(function(done) {
        step(
            function deleteTemplate(err) {
                assert.ifError(err);
                var next = this;
                assert.response(
                    server,
                    {
                        url: '/api/v1/map/named/' + widgetsTemplateName + '?api_key=1234',
                        method: 'DELETE',
                        headers: {
                            host: username
                        }
                    },
                    {
                        status: 204
                    },
                    function(res, err) {
                        next(err, res);
                    }
                );
            },
            function deleteRedisKeys(err) {
                assert.ifError(err);
                helper.deleteRedisKeys(keysToDelete, done);
            }
        );
    });

    it('should be able to retrieve widgets from all URLs', function(done) {
        assert.response(
            server,
            {
                url: '/api/v1/map/' + layergroupid + '/6/31/24.png',
                method: 'GET',
                encoding: 'binary',
                headers: {
                    host: username
                }
            },
            {
                status: 200,
                headers: {
                    'Content-Type': 'image/png'
                }
            },
            function(res, err) {
                if (err) {
                    return done(err);
                }

//                var image = mapnik.Image.fromBytes(new Buffer(res.body, 'binary'));
//                assert.ok(image);
                var fixturePath = './test/fixtures/analysis/named-map-buffer.png';
                assert.imageBufferIsSimilarToFile(res.body, fixturePath, IMAGE_TOLERANCE_PER_MIL, function(err) {
                    assert.ok(!err, err);
                    done();
                });

            }
        );
    });

});
