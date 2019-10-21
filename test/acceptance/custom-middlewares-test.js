'use strict';

const helper = require('../support/test-helper');
const assert = require('../support/assert');
const createServer = require('../../lib/server');
const serverOptions = require('../../lib/server-options');

describe('custom middlewares', function () {
    const RESPONSE_OK = {
        statusCode: 200
    };
    const RESPONSE_KO_TEAPOT = {
        statusCode: 418
    };

    describe('wired in /api/v1', function () {
        before(function () {
            const options = Object.assign({}, serverOptions, {
                routes: {
                    api: [{
                        paths: [
                            '/api/v1',
                            '/user/:user/api/v1'
                        ],
                        middlewares: [
                            function teapot () {
                                return function teapotMiddleware (req, res) {
                                    res.status(418).send('I\'m a teapot');
                                };
                            }
                        ],
                        // Base url for the Detached Maps API
                        // "/api/v1/map" is the new API,
                        map: [{
                            paths: [
                                '/map'
                            ]
                        }],
                        // Base url for the Templated Maps API
                        // "/api/v1/map/named" is the new API,
                        template: [{
                            paths: [
                                '/map/named'
                            ]
                        }]
                    }]
                }
            });

            this.server = createServer(options);
        });

        it('POST /api/v1/map/named returns 418: "I\'m a teapot"', function (done) {
            const templateid = `custom-middlewares-test-${Date.now()}`;
            const template = {
                version: '0.0.1',
                name: templateid,
                layergroup: {
                    layers: [{
                        type: 'cartodb',
                        options: {
                            sql: 'select 1 as cartodb_id, null::geometry as the_geom_webmercator'
                        }
                    }]
                }
            };
            const request = {
                url: '/api/v1/map/named?api_key=1234',
                method: 'POST',
                headers: {
                    host: 'localhost',
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(template)
            };

            assert.response(this.server, request, RESPONSE_KO_TEAPOT, (res, err) => {
                if (err) {
                    return done(err);
                }

                assert.strictEqual(res.body, 'I\'m a teapot');

                done();
            });
        });

        it('POST /api/v1/map returns 418: "I\'m a teapot"', function (done) {
            const mapConfig = {
                layers: [{
                    type: 'cartodb',
                    options: {
                        sql: 'select 1 as cartodb_id, null::geometry as the_geom_webmercator'
                    }
                }]
            };
            const request = {
                url: '/api/v1/map',
                method: 'POST',
                headers: {
                    host: 'localhost',
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(mapConfig)
            };

            assert.response(this.server, request, RESPONSE_KO_TEAPOT, (res, err) => {
                if (err) {
                    return done(err);
                }

                assert.strictEqual(res.body, 'I\'m a teapot');

                done();
            });
        });
    });

    describe('wired in /api/v1/map', function () {
        before(function () {
            const options = Object.assign({}, serverOptions, {
                routes: {
                    api: [{
                        paths: [
                            '/api/v1',
                            '/user/:user/api/v1'
                        ],
                        // Base url for the Detached Maps API
                        // "/api/v1/map" is the new API,
                        map: [{
                            paths: [
                                '/map'
                            ],
                            middlewares: [
                                function teapot () {
                                    return function teapotMiddleware (req, res, next) {
                                        if (req.path === '/') {
                                            return res.status(418).send('I\'m a teapot');
                                        }
                                        next();
                                    };
                                }
                            ]
                        }],
                        // Base url for the Templated Maps API
                        // "/api/v1/map/named" is the new API,
                        template: [{
                            paths: [
                                '/map/named'
                            ]
                        }]
                    }]
                }
            });

            this.server = createServer(options);
        });

        it('POST /api/v1/map/named returns 200: template created', function (done) {
            const templateid = `custom-middlewares-test-${Date.now()}`;
            const template = {
                version: '0.0.1',
                name: templateid,
                layergroup: {
                    layers: [{
                        type: 'cartodb',
                        options: {
                            sql: 'select 1 as cartodb_id, null::geometry as the_geom_webmercator'
                        }
                    }]
                }
            };
            const request = {
                url: '/api/v1/map/named?api_key=1234',
                method: 'POST',
                headers: {
                    host: 'localhost',
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(template)
            };

            assert.response(this.server, request, RESPONSE_OK, (res, err) => {
                if (err) {
                    return done(err);
                }

                const body = JSON.parse(res.body);

                assert.deepStrictEqual(body, { template_id: templateid });

                helper.deleteRedisKeys({ 'map_tpl|localhost': 0 }, done);
            });
        });

        it('POST /api/v1/map returns 418: "I\'m a teapot"', function (done) {
            const mapConfig = {
                layers: [{
                    type: 'cartodb',
                    options: {
                        sql: 'select 1 as cartodb_id, null::geometry as the_geom_webmercator'
                    }
                }]
            };
            const request = {
                url: '/api/v1/map',
                method: 'POST',
                headers: {
                    host: 'localhost',
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(mapConfig)
            };

            assert.response(this.server, request, RESPONSE_KO_TEAPOT, (res, err) => {
                if (err) {
                    return done(err);
                }

                assert.strictEqual(res.body, 'I\'m a teapot');

                done();
            });
        });
    });

    describe('wired in /api/v1/map/named', function () {
        before(function () {
            const options = Object.assign({}, serverOptions, {
                routes: {
                    api: [{
                        paths: [
                            '/api/v1',
                            '/user/:user/api/v1'
                        ],
                        // Base url for the Detached Maps API
                        // "/api/v1/map" is the new API,
                        map: [{
                            paths: [
                                '/map'
                            ]
                        }],
                        // Base url for the Templated Maps API
                        // "/api/v1/map/named" is the new API,
                        template: [{
                            paths: [
                                '/map/named'
                            ],
                            middlewares: [
                                function teapot () {
                                    return function teapotMiddleware (req, res) {
                                        res.status(418).send('I\'m a teapot');
                                    };
                                }
                            ]
                        }]
                    }]
                }
            });

            this.server = createServer(options);
        });

        it('POST /api/v1/map/named returns 418: "I\'m a teapot"', function (done) {
            const templateid = `custom-middlewares-test-${Date.now()}`;
            const template = {
                version: '0.0.1',
                name: templateid,
                layergroup: {
                    layers: [{
                        type: 'cartodb',
                        options: {
                            sql: 'select 1 as cartodb_id, null::geometry as the_geom_webmercator'
                        }
                    }]
                }
            };
            const request = {
                url: '/api/v1/map/named?api_key=1234',
                method: 'POST',
                headers: {
                    host: 'localhost',
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(template)
            };

            assert.response(this.server, request, RESPONSE_KO_TEAPOT, (res, err) => {
                if (err) {
                    return done(err);
                }

                assert.strictEqual(res.body, 'I\'m a teapot');

                done();
            });
        });

        it('POST /api/v1/map returns 200: anonymous map created', function (done) {
            const mapConfig = {
                layers: [{
                    type: 'cartodb',
                    options: {
                        sql: 'select 1 as cartodb_id, null::geometry as the_geom_webmercator'
                    }
                }]
            };
            const request = {
                url: '/api/v1/map',
                method: 'POST',
                headers: {
                    host: 'localhost',
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(mapConfig)
            };

            assert.response(this.server, request, RESPONSE_OK, (res, err) => {
                if (err) {
                    return done(err);
                }

                const body = JSON.parse(res.body);

                assert.ok(body.layergroupid);

                helper.deleteRedisKeys({ 'user:localhost:mapviews:global': 5 }, done);
            });
        });
    });
});
