'use strict';

require('../support/test-helper');

const request = require('request');
const assert = require('assert');
const Server = require('../../lib/server');
const serverOptions = require('../../lib/server-options');
const mapnik = require('@carto/mapnik');
const helper = require('../support/test-helper');

const namedTileUrlTemplate = (ctx) => {
    return `http://${ctx.address}/api/v1/map/static/named/${ctx.templateId}/256/256.png?api_key=${ctx.apiKey}`;
};

describe('named map cache regressions', function () {
    const server = new Server(serverOptions);

    const apiKey = 1234;

    const template = {
        version: '0.0.1',
        name: 'named-map-cache-regression-missing-template',
        layergroup: {
            version: '1.8.0',
            layers: [
                {
                    type: 'cartodb',
                    options: {
                        source: {
                            id: 'a1'
                        },
                        cartocss: '#layer{marker-placement: point;marker-width: 5;marker-fill: red;}',
                        cartocss_version: '2.3.0'
                    }
                }
            ],
            analyses: [
                {
                    id: 'a1',
                    type: 'source',
                    params: {
                        query: 'select * from populated_places_simple_reduced'
                    }
                }
            ]
        }
    };

    const port = 0; // let the OS to choose a free port
    const host = '127.0.0.1';

    let listener;
    let address;

    const keysToDelete = {};

    before(function (done) {
        listener = server.listen(port, host);

        listener.on('error', done);
        listener.on('listening', () => {
            const { address: host, port } = listener.address();

            address = `${host}:${port}`;

            done();
        });
    });

    after(function (done) {
        helper.deleteRedisKeys(keysToDelete, () => listener.close(done));
    });

    it('should not fail when a template gets recreated', function (done) {
        this.timeout(10000);

        const createTemplateRequest = {
            url: `http://${address}/api/v1/map/named?api_key=${apiKey}`,
            method: 'POST',
            headers: {
                host: 'localhost',
                'Content-Type': 'application/json'
            },
            body: template,
            json: true
        };

        request(createTemplateRequest, (err, res, body) => {
            if (err) {
                return done(err);
            }

            assert.strictEqual(res.statusCode, 200);

            const templateId = body.template_id;

            keysToDelete['map_tpl|localhost'] = 0;

            const previewRequest = {
                url: `http://${address}/api/v1/map/static/named/${templateId}/256/256.png?api_key=${apiKey}`,
                encoding: 'binary',
                method: 'GET',
                headers: {
                    host: 'localhost'
                }
            };

            request(previewRequest, (err, res) => {
                if (err) {
                    return done(err);
                }

                assert.strictEqual(res.statusCode, 200);

                const preview = mapnik.Image.fromBytes(Buffer.from(res.body, 'binary'));

                assert.strictEqual(preview.width(), 256);
                assert.strictEqual(preview.height(), 256);

                const templateUpdate = Object.assign({}, template);

                const newQuery = 'select * from populated_places_simple_reduced limit 100';
                templateUpdate.layergroup.analyses[0].params.query = newQuery;

                const updateTemplateRequest = {
                    url: `http://${address}/api/v1/map/named/${templateId}?api_key=${apiKey}`,
                    method: 'PUT',
                    headers: {
                        host: 'localhost',
                        'Content-Type': 'application/json'
                    },
                    body: templateUpdate,
                    json: true
                };

                request(updateTemplateRequest, (err, res) => {
                    if (err) {
                        return done(err);
                    }

                    assert.strictEqual(res.statusCode, 200);

                    request(previewRequest, (err, res) => {
                        if (err) {
                            return done(err);
                        }

                        const preview = mapnik.Image.fromBytes(Buffer.from(res.body, 'binary'));

                        assert.strictEqual(preview.width(), 256);
                        assert.strictEqual(preview.height(), 256);

                        request(previewRequest, (err, res) => {
                            if (err) {
                                return done(err);
                            }

                            const preview = mapnik.Image.fromBytes(Buffer.from(res.body, 'binary'));

                            assert.strictEqual(preview.width(), 256);
                            assert.strictEqual(preview.height(), 256);

                            const deleteTemplateRequest = {
                                url: `http://${address}/api/v1/map/named/${templateId}?api_key=${apiKey}`,
                                method: 'DELETE',
                                headers: {
                                    host: 'localhost'
                                }
                            };

                            request(deleteTemplateRequest, (err) => {
                                if (err) {
                                    return done(err);
                                }

                                delete keysToDelete['map_tpl|localhost'];

                                assert.strictEqual(res.statusCode, 200);

                                request(createTemplateRequest, (err, res, body) => {
                                    if (err) {
                                        return done(err);
                                    }

                                    assert.strictEqual(res.statusCode, 200);

                                    const templateId = body.template_id;

                                    keysToDelete['map_tpl|localhost'] = 0;

                                    const previewRequest = {
                                        url: namedTileUrlTemplate({ address, templateId, apiKey }),
                                        encoding: 'binary',
                                        method: 'GET',
                                        headers: {
                                            host: 'localhost'
                                        }
                                    };

                                    request(previewRequest, (err, res) => {
                                        if (err) {
                                            return done(err);
                                        }

                                        assert.strictEqual(res.statusCode, 200);

                                        const preview = mapnik.Image.fromBytes(Buffer.from(res.body, 'binary'));

                                        assert.strictEqual(preview.width(), 256);
                                        assert.strictEqual(preview.height(), 256);

                                        request(deleteTemplateRequest, (err) => {
                                            if (err) {
                                                return done(err);
                                            }

                                            delete keysToDelete['map_tpl|localhost'];

                                            assert.strictEqual(res.statusCode, 200);

                                            keysToDelete['user:localhost:mapviews:global'] = 0;
                                            keysToDelete['user:localhost:mapviews:global'] = 5;

                                            helper.deleteRedisKeys(keysToDelete, done);
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});
