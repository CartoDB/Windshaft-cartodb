'use strict';

const assert = require('assert');
const TestClient = require('../support/test-client');
const MetricsBackend = require('../../lib/backends/metrics');
const LayergroupToken = require('../../lib/models/layergroup-token');
const apikey = 1234;
const mapConfig = {
    version: '1.8.0',
    layers: [
        {
            options: {
                sql: TestClient.SQL.ONE_POINT,
                cartocss: TestClient.CARTOCSS.POINTS,
                cartocss_version: '2.3.0'
            }
        }
    ]
};

function templateBuilder ({ name }) {
    return {
        version: '0.0.1',
        name: `metrics-template-${name}`,
        layergroup: {
            version: '1.8.0',
            layers: [
                {
                    type: 'cartodb',
                    options: {
                        sql: TestClient.SQL.ONE_POINT,
                        cartocss: TestClient.CARTOCSS.POINTS,
                        cartocss_version: '2.3.0'
                    }
                }
            ]
        }
    };
};

describe('metrics middleware', function () {
    beforeEach(function () {
        this.originalMetricsBackendSendMethod = MetricsBackend.prototype.send;
        this.pubSubMetricsBackendSendMethodCalled = false;
        MetricsBackend.prototype.send = (event, attributes) => {
            this.pubSubMetricsBackendSendMethodCalled = true;
            this.pubSubMetricsBackendSendMethodCalledWith = { event, attributes };
            return Promise.resolve();
        };
    });

    afterEach(function (done) {
        MetricsBackend.prototype.send = this.originalMetricsBackendSendMethod;
        return this.testClient.drain(done);
    });

    it('should not send event if not enabled', function (done) {
        const extraHeaders = {
            'Carto-Event': 'test-event',
            'Carto-Event-Source': 'test',
            'Carto-Event-Group-Id': '1'
        };
        const overrideServerOptions = { pubSubMetrics: { enabled: false } };

        this.testClient = new TestClient(mapConfig, apikey, extraHeaders, overrideServerOptions);

        this.testClient.getLayergroup((err, body) => {
            if (err) {
                return done(err);
            }

            assert.strictEqual(typeof body.layergroupid, 'string');
            assert.ok(!this.pubSubMetricsBackendSendMethodCalled);

            return done();
        });
    });

    it('should not send event if headers not present', function (done) {
        const extraHeaders = {};
        const overrideServerOptions = { pubSubMetrics: { enabled: false } };

        this.testClient = new TestClient(mapConfig, apikey, extraHeaders, overrideServerOptions);

        this.testClient.getLayergroup((err, body) => {
            if (err) {
                return done(err);
            }

            assert.strictEqual(typeof body.layergroupid, 'string');
            assert.ok(!this.pubSubMetricsBackendSendMethodCalled);

            return done();
        });
    });

    it('should send event for map requests', function (done) {
        const expectedEvent = 'map_view';
        const expectedMetricsEvent = 'event-test';
        const expectedEventSource = 'event-source-test';
        const expectedEventGroupId = '1';
        const expectedResponseCode = '200';
        const expectedMapType = 'anonymous';
        const extraHeaders = {
            'Carto-Event': expectedMetricsEvent,
            'Carto-Event-Source': expectedEventSource,
            'Carto-Event-Group-Id': expectedEventGroupId
        };
        const overrideServerOptions = { pubSubMetrics: { enabled: true, topic: 'topic-test' } };

        this.testClient = new TestClient(mapConfig, apikey, extraHeaders, overrideServerOptions);

        this.testClient.getLayergroup((err, body) => {
            if (err) {
                return done(err);
            }

            assert.strictEqual(typeof body.layergroupid, 'string');

            const { token, cacheBuster } = LayergroupToken.parse(body.layergroupid);

            assert.ok(this.pubSubMetricsBackendSendMethodCalled);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.event, expectedEvent);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.metrics_event, expectedMetricsEvent);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_source, expectedEventSource);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_group_id, expectedEventGroupId);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.response_code, expectedResponseCode);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.map_type, expectedMapType);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.map_id, token);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.cache_buster, cacheBuster);

            return done();
        });
    });

    it('should normalized headers type and length', function (done) {
        const expectedEvent = 'map_view';
        const eventLong = 'If you are sending a text this long in a header you kind of deserve the worst, honestly. I mean this is not a header, it is almost a novel, and you do not see any Novel cookie here, right?';
        const expectedMetricsEvent = eventLong.trim().substr(0, 100);
        const expectedEventGroupId = '1';
        const expectedEventSource = 'test';
        const expectedResponseCode = '200';
        const expectedMapType = 'anonymous';
        const extraHeaders = {
            'Carto-Event': eventLong,
            'Carto-Event-Source': 'test',
            'Carto-Event-Group-Id': 1
        };
        const overrideServerOptions = { pubSubMetrics: { enabled: true, topic: 'topic-test' } };

        this.testClient = new TestClient(mapConfig, apikey, extraHeaders, overrideServerOptions);

        this.testClient.getLayergroup((err, body) => {
            if (err) {
                return done(err);
            }

            assert.strictEqual(typeof body.layergroupid, 'string');

            const { token, cacheBuster } = LayergroupToken.parse(body.layergroupid);

            assert.ok(this.pubSubMetricsBackendSendMethodCalled);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.event, expectedEvent);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.metrics_event, expectedMetricsEvent);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_source, expectedEventSource);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_group_id, expectedEventGroupId);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.response_code, expectedResponseCode);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.map_type, expectedMapType);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.map_id, token);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.cache_buster, cacheBuster);

            return done();
        });
    });

    it('should send event when error', function (done) {
        const expectedEvent = 'map_view';
        const expectedMetricsEvent = 'event-test';
        const expectedEventSource = 'event-source-test';
        const expectedEventGroupId = '1';
        const expectedResponseCode = '400';
        const expectedMapType = 'anonymous';
        const extraHeaders = {
            'Carto-Event': expectedMetricsEvent,
            'Carto-Event-Source': expectedEventSource,
            'Carto-Event-Group-Id': expectedEventGroupId
        };
        const overrideServerOptions = { pubSubMetrics: { enabled: true, topic: 'topic-test' } };
        const mapConfigMissingCartoCSS = {
            version: '1.8.0',
            layers: [
                {
                    options: {
                        sql: TestClient.SQL.ONE_POINT,
                        cartocss: TestClient.CARTOCSS.POINTS
                    }
                }
            ]
        };

        this.testClient = new TestClient(mapConfigMissingCartoCSS, apikey, extraHeaders, overrideServerOptions);

        const params = { response: { status: 400 } };

        this.testClient.getLayergroup(params, (err, body) => {
            if (err) {
                return done(err);
            }

            assert.ok(this.pubSubMetricsBackendSendMethodCalled);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.event, expectedEvent);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.metrics_event, expectedMetricsEvent);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_source, expectedEventSource);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_group_id, expectedEventGroupId);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.response_code, expectedResponseCode);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.map_type, expectedMapType);
            assert.strictEqual(typeof this.pubSubMetricsBackendSendMethodCalledWith.attributes.map_id, 'string');
            assert.strictEqual(typeof this.pubSubMetricsBackendSendMethodCalledWith.attributes.cache_buster, 'string');

            return done();
        });
    });

    it.skip('should send event for tile requests', function (done) {
        const expectedEvent = 'event-tile-test';
        const expectedEventSource = 'event-source-tile-test';
        const expectedEventGroupId = '12345';
        const expectedResponseCode = '200';
        const extraHeaders = {
            'Carto-Event': expectedEvent,
            'Carto-Event-Source': expectedEventSource,
            'Carto-Event-Group-Id': expectedEventGroupId
        };
        const overrideServerOptions = { pubSubMetrics: { enabled: true, topic: 'topic-test' } };

        this.testClient = new TestClient(mapConfig, apikey, extraHeaders, overrideServerOptions);

        this.testClient.getTile(0, 0, 0, (err, res, tile) => {
            if (err) {
                return done(err);
            }

            assert.ok(this.pubSubMetricsBackendSendMethodCalled);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.event, expectedEvent);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_source, expectedEventSource);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_group_id, expectedEventGroupId);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.response_code, expectedResponseCode);
            assert.strictEqual(typeof this.pubSubMetricsBackendSendMethodCalledWith.attributes.map_id, 'string');
            assert.strictEqual(typeof this.pubSubMetricsBackendSendMethodCalledWith.attributes.cache_buster, 'string');

            return done();
        });
    });

    it.skip('should send event for errored tile requests', function (done) {
        const expectedEvent = 'event-tile-test';
        const expectedEventSource = 'event-source-tile-test';
        const expectedEventGroupId = '12345';
        const expectedResponseCode = '400';
        const extraHeaders = {
            'Carto-Event': expectedEvent,
            'Carto-Event-Source': expectedEventSource,
            'Carto-Event-Group-Id': expectedEventGroupId
        };
        const overrideServerOptions = { pubSubMetrics: { enabled: true, topic: 'topic-test' } };

        this.testClient = new TestClient(mapConfig, apikey, extraHeaders, overrideServerOptions);

        const params = {
            response: {
                status: 400,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                }
            }
        };

        this.testClient.getTile(0, 0, 2, params, (err, res, tile) => {
            if (err) {
                return done(err);
            }

            assert.ok(this.pubSubMetricsBackendSendMethodCalled);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.event, expectedEvent);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_source, expectedEventSource);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_group_id, expectedEventGroupId);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.response_code, expectedResponseCode);
            assert.strictEqual(typeof this.pubSubMetricsBackendSendMethodCalledWith.attributes.map_id, 'string');
            assert.strictEqual(typeof this.pubSubMetricsBackendSendMethodCalledWith.attributes.cache_buster, 'string');

            return done();
        });
    });

    it('should send event for named map requests', function (done) {
        const expectedEvent = 'map_view';
        const expectedMetricsEvent = 'event-test';
        const expectedEventSource = 'event-source-test';
        const expectedEventGroupId = '1';
        const expectedResponseCode = '200';
        const expectedMapType = 'named';
        const extraHeaders = {
            'Carto-Event': expectedMetricsEvent,
            'Carto-Event-Source': expectedEventSource,
            'Carto-Event-Group-Id': expectedEventGroupId
        };
        const overrideServerOptions = { pubSubMetrics: { enabled: true, topic: 'topic-test' } };
        const template = templateBuilder({ name: 'map' });

        this.testClient = new TestClient(template, apikey, extraHeaders, overrideServerOptions);

        this.testClient.getLayergroup((err, body) => {
            if (err) {
                return done(err);
            }

            assert.strictEqual(typeof body.layergroupid, 'string');

            const { token, cacheBuster } = LayergroupToken.parse(body.layergroupid);

            assert.ok(this.pubSubMetricsBackendSendMethodCalled);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.event, expectedEvent);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.metrics_event, expectedMetricsEvent);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_source, expectedEventSource);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_group_id, expectedEventGroupId);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.response_code, expectedResponseCode);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.map_type, expectedMapType);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.map_id, token);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.cache_buster, cacheBuster);

            return done();
        });
    });

    it('should send event for errored named map requests', function (done) {
        const expectedEvent = 'map_view';
        const expectedMetricsEvent = 'event-test';
        const expectedEventSource = 'event-source-test';
        const expectedEventGroupId = '1';
        const expectedResponseCode = '400';
        const expectedMapType = 'named';
        const extraHeaders = {
            'Carto-Event': expectedMetricsEvent,
            'Carto-Event-Source': expectedEventSource,
            'Carto-Event-Group-Id': expectedEventGroupId
        };
        const overrideServerOptions = { pubSubMetrics: { enabled: true, topic: 'topic-test' } };
        const templateMissingCartoCSS = {
            version: '0.0.1',
            name: 'metrics-template',
            layergroup: {
                version: '1.8.0',
                layers: [
                    {
                        type: 'cartodb',
                        options: {
                            sql: TestClient.SQL.ONE_POINT,
                            cartocss: TestClient.CARTOCSS.POINTS
                        }
                    }
                ]
            }
        };

        this.testClient = new TestClient(templateMissingCartoCSS, apikey, extraHeaders, overrideServerOptions);

        const params = {
            response: {
                status: 400,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                }
            }
        };

        this.testClient.getLayergroup(params, (err, body) => {
            if (err) {
                return done(err);
            }

            assert.ok(this.pubSubMetricsBackendSendMethodCalled);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.event, expectedEvent);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.metrics_event, expectedMetricsEvent);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_source, expectedEventSource);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_group_id, expectedEventGroupId);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.response_code, expectedResponseCode);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.map_type, expectedMapType);
            assert.strictEqual(typeof this.pubSubMetricsBackendSendMethodCalledWith.attributes.map_id, 'string');
            assert.strictEqual(typeof this.pubSubMetricsBackendSendMethodCalledWith.attributes.cache_buster, 'string');

            return done();
        });
    });

    it.skip('should send event for named map tile requests', function (done) {
        const expectedEvent = 'event-named-map-tile-test';
        const expectedEventSource = 'event-source-named-map-tile-test';
        const expectedEventGroupId = '1';
        const expectedResponseCode = '200';
        const extraHeaders = {
            'Carto-Event': expectedEvent,
            'Carto-Event-Source': expectedEventSource,
            'Carto-Event-Group-Id': expectedEventGroupId
        };
        const overrideServerOptions = { pubSubMetrics: { enabled: true, topic: 'topic-test' } };
        const template = templateBuilder({ name: 'tile' });

        this.testClient = new TestClient(template, apikey, extraHeaders, overrideServerOptions);

        this.testClient.getTile(0, 0, 0, (err, body) => {
            if (err) {
                return done(err);
            }

            assert.ok(this.pubSubMetricsBackendSendMethodCalled);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.event, expectedEvent);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_source, expectedEventSource);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_group_id, expectedEventGroupId);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.response_code, expectedResponseCode);
            assert.strictEqual(typeof this.pubSubMetricsBackendSendMethodCalledWith.attributes.map_id, 'string');
            assert.strictEqual(typeof this.pubSubMetricsBackendSendMethodCalledWith.attributes.cache_buster, 'string');

            return done();
        });
    });

    it('should send event for static named map requests', function (done) {
        const expectedEvent = 'map_view';
        const expectedMetricsEvent = 'event-test';
        const expectedEventSource = 'event-source-test';
        const expectedEventGroupId = '1';
        const expectedResponseCode = '200';
        const expectedMapType = 'static';
        const extraHeaders = {
            'Carto-Event': expectedMetricsEvent,
            'Carto-Event-Source': expectedEventSource,
            'Carto-Event-Group-Id': expectedEventGroupId
        };
        const overrideServerOptions = { pubSubMetrics: { enabled: true, topic: 'topic-test' } };
        const template = templateBuilder({ name: 'preview' });

        this.testClient = new TestClient(template, apikey, extraHeaders, overrideServerOptions);

        this.testClient.getPreview(640, 480, {}, (err, res, body) => {
            if (err) {
                return done(err);
            }

            assert.ok(this.pubSubMetricsBackendSendMethodCalled);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.event, expectedEvent);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.metrics_event, expectedMetricsEvent);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_source, expectedEventSource);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_group_id, expectedEventGroupId);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.response_code, expectedResponseCode);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.map_type, expectedMapType);
            assert.strictEqual(typeof this.pubSubMetricsBackendSendMethodCalledWith.attributes.map_id, 'string');
            assert.strictEqual(typeof this.pubSubMetricsBackendSendMethodCalledWith.attributes.cache_buster, 'string');

            return done();
        });
    });

    it('should send event for errored static named map requests', function (done) {
        const expectedEvent = 'map_view';
        const expectedMetricsEvent = 'event-test';
        const expectedEventSource = 'event-source-test';
        const expectedEventGroupId = '1';
        const expectedResponseCode = '400';
        const expectedMapType = 'static';
        const extraHeaders = {
            'Carto-Event': expectedMetricsEvent,
            'Carto-Event-Source': expectedEventSource,
            'Carto-Event-Group-Id': expectedEventGroupId
        };
        const overrideServerOptions = { pubSubMetrics: { enabled: true, topic: 'topic-test' } };
        const template = templateBuilder({ name: 'preview-errored' });

        this.testClient = new TestClient(template, apikey, extraHeaders, overrideServerOptions);

        const widthTooLarge = 8193;
        const params = {
            response: {
                status: 400,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                }
            }
        };

        this.testClient.getPreview(widthTooLarge, 480, params, (err, res, body) => {
            if (err) {
                return done(err);
            }

            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.event, expectedEvent);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.metrics_event, expectedMetricsEvent);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_source, expectedEventSource);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_group_id, expectedEventGroupId);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.response_code, expectedResponseCode);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.map_type, expectedMapType);
            assert.strictEqual(typeof this.pubSubMetricsBackendSendMethodCalledWith.attributes.map_id, 'string');
            assert.strictEqual(typeof this.pubSubMetricsBackendSendMethodCalledWith.attributes.cache_buster, 'string');

            return done();
        });
    });
});
