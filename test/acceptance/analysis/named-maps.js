var assert = require('../../support/assert');

var helper = require('../../support/test_helper');

var CartodbWindshaft = require('../../../lib/cartodb/server');
var serverOptions = require('../../../lib/cartodb/server_options');
var server = new CartodbWindshaft(serverOptions);
var TestClient = require('../../support/test-client');

var LayergroupToken = require('../../support/layergroup-token');

describe('named-maps analysis', function() {

    var IMAGE_TOLERANCE_PER_MIL = 20;

    var username = 'localhost';
    var widgetsTemplateName = 'widgets-template';

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
            dataviews: {
                pop_max_histogram: {
                    source: {
                        id: 'HEAD'
                    },
                    type: 'histogram',
                    options: {
                        column: 'pop_max'
                    }
                }
            },
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
                        "radius": 50000
                    }
                }
            ]
        }
    };

    beforeEach(function createTemplate(done) {
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
                assert.deepEqual(JSON.parse(res.body), { template_id: widgetsTemplateName });
                return done(err);
            }
        );
    });

    afterEach(function deleteTemplate(done) {
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
                return done(err);
            }
        );
    });

    describe('layergroup', function() {
        var layergroupid;
        var layergroup;
        var keysToDelete;

        beforeEach(function(done) {
            keysToDelete = {};

            assert.response(
                server,
                {
                    url: '/api/v1/map/named/' + widgetsTemplateName,
                    method: 'POST',
                    headers: {
                        host: username,
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify({})
                },
                {
                    status: 200
                },
                function(res, err) {
                    assert.ifError(err);

                    layergroup = JSON.parse(res.body);
                    assert.ok(layergroup.hasOwnProperty('layergroupid'), "Missing 'layergroupid' from: " + res.body);
                    layergroupid = layergroup.layergroupid;

                    assert.ok(
                        Array.isArray(layergroup.metadata.analyses),
                            'Missing "analyses" array metadata from: ' + res.body
                    );
                    var analyses = layergroup.metadata.analyses;
                    assert.equal(analyses.length, 1, 'Invalid number of analyses in metadata');
                    var nodes = analyses[0].nodes;
                    var nodesIds = Object.keys(nodes);
                    assert.deepEqual(nodesIds, ['2570e105-7b37-40d2-bdf4-1af889598745', 'HEAD']);
                    nodesIds.forEach(function(nodeId) {
                        var node = nodes[nodeId];
                        assert.ok(node.hasOwnProperty('url'), 'Missing "url" attribute in node');
                        assert.ok(node.hasOwnProperty('status'), 'Missing "status" attribute in node');
                        assert.ok(!node.hasOwnProperty('query'), 'Unexpected "query" attribute in node');
                    });

                    keysToDelete['map_cfg|' + LayergroupToken.parse(layergroup.layergroupid).token] = 0;
                    keysToDelete['user:localhost:mapviews:global'] = 5;

                    return done();
                }
            );

        });

        afterEach(function(done) {
            helper.deleteRedisKeys(keysToDelete, done);
        });

        it('should be able to retrieve images from analysis', function(done) {
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

                    var fixturePath = './test/fixtures/analysis/named-map-buffer.png';
                    assert.imageBufferIsSimilarToFile(res.body, fixturePath, IMAGE_TOLERANCE_PER_MIL, function(err) {
                        assert.ok(!err, err);
                        done();
                    });

                }
            );
        });

        it('should be able to retrieve dataviews from analysis', function(done) {
            assert.response(
                server,
                {
                    url: '/api/v1/map/' + layergroupid + '/dataview/pop_max_histogram',
                    method: 'GET',
                    headers: {
                        host: username
                    }
                },
                {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8'
                    }
                },
                function(res, err) {
                    if (err) {
                        return done(err);
                    }

                    var dataview = JSON.parse(res.body);
                    assert.equal(dataview.type, 'histogram');
                    assert.equal(dataview.bins_start, 0);

                    done();
                }
            );
        });

        it('should be able to retrieve static map preview via layergroup', function(done) {
            assert.response(
                server,
                {
                    url: '/api/v1/map/static/center/' + layergroupid + '/4/42/-3/320/240.png',
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

                    var fixturePath = './test/fixtures/analysis/named-map-buffer-layergroup-static-preview.png';
                    assert.imageBufferIsSimilarToFile(res.body, fixturePath, IMAGE_TOLERANCE_PER_MIL, function(err) {
                        assert.ok(!err, err);
                        done();
                    });

                }
            );
        });

    });

    describe('auto-instantiation', function() {
        it('should be able to retrieve static map preview via fixed url', function(done) {
            TestClient.getStaticMap(widgetsTemplateName, function(err, image) {
                assert.ok(!err, err);
                var fixturePath = './test/fixtures/analysis/named-map-buffer-static-preview.png';
                assert.imageIsSimilarToFile(image, fixturePath, IMAGE_TOLERANCE_PER_MIL, function(err) {
                    assert.ok(!err, err);
                    done();
                });
            });
        });
    });

});
