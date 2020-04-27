'use strict';

const assert = require('assert');
const TestClient = require('../support/test-client');
const PubSubMetricsBackend = require('../../lib/backends/pubsub-metrics');

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
const apikey = 1234;

describe('pubsub metrics middleware', function () {
    beforeEach(function () {
        this.originalPubSubMetricsBackendSendMethod = PubSubMetricsBackend.prototype.send;
        this.pubSubMetricsBackendSendMethodCalled = false;
        PubSubMetricsBackend.prototype.send = (event, attributes) => {
            this.pubSubMetricsBackendSendMethodCalled = true;
            this.pubSubMetricsBackendSendMethodCalledWith = { event, attributes };
            return Promise.resolve();
        };
    });

    afterEach(function () {
        PubSubMetricsBackend.prototype.send = this.originalPubSubMetricsBackendSendMethod;
    });

    it('should not send event if not enabled', function (done) {
        const extraHeaders = {
            'Carto-Event': 'test-event',
            'Carto-Event-Source': 'test',
            'Carto-Event-Group-Id': '1'
        };
        const overrideServerOptions = { pubSubMetrics: { enabled: false } };
        const testClient = new TestClient(mapConfig, apikey, extraHeaders, overrideServerOptions);

        testClient.getLayergroup((err, body) => {
            if (err) {
                return done(err);
            }

            assert.strictEqual(typeof body.layergroupid, 'string');
            assert.ok(!this.pubSubMetricsBackendSendMethodCalled);

            return testClient.drain(done);
        });
    });

    it('should not send event if headers not present', function (done) {
        const extraHeaders = {};
        const overrideServerOptions = { pubSubMetrics: { enabled: false } };
        const testClient = new TestClient(mapConfig, apikey, extraHeaders, overrideServerOptions);

        testClient.getLayergroup((err, body) => {
            if (err) {
                return done(err);
            }

            assert.strictEqual(typeof body.layergroupid, 'string');
            assert.ok(!this.pubSubMetricsBackendSendMethodCalled);

            return testClient.drain(done);
        });
    });

    it('should send event for map requests', function (done) {
        const expectedEvent = 'event-test';
        const expectedEventSource = 'event-source-test';
        const expectedEventGroupId = '1';
        const extraHeaders = {
            'Carto-Event': expectedEvent,
            'Carto-Event-Source': expectedEventSource,
            'Carto-Event-Group-Id': expectedEventGroupId
        };
        const overrideServerOptions = { pubSubMetrics: { enabled: true, topic: 'topic-test' } };
        const testClient = new TestClient(mapConfig, apikey, extraHeaders, overrideServerOptions);

        testClient.getLayergroup((err, body) => {
            if (err) {
                return done(err);
            }

            assert.strictEqual(typeof body.layergroupid, 'string');
            assert.ok(this.pubSubMetricsBackendSendMethodCalled);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.event, expectedEvent);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_source, expectedEventSource);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_group_id, expectedEventGroupId);

            return testClient.drain(done);
        });
    });

    it('should normalized headers type and length', function (done) {
        const eventLong = 'If you are sending a text this long in a header you kind of deserve the worst, honestly. I mean this is not a header, it is almost a novel, and you do not see any Novel cookie here, right?';
        const expectedEvent = eventLong.trim().substr(0, 100);
        const expectedEventGroupId = '1';
        const expectedEventSource = 'test';
        const extraHeaders = {
            'Carto-Event': eventLong,
            'Carto-Event-Source': 'test',
            'Carto-Event-Group-Id': 1
        };
        const overrideServerOptions = { pubSubMetrics: { enabled: true, topic: 'topic-test' } };
        const testClient = new TestClient(mapConfig, apikey, extraHeaders, overrideServerOptions);

        testClient.getLayergroup((err, body) => {
            if (err) {
                return done(err);
            }

            assert.strictEqual(typeof body.layergroupid, 'string');
            assert.ok(this.pubSubMetricsBackendSendMethodCalled);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.event, expectedEvent);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_source, expectedEventSource);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_group_id, expectedEventGroupId);

            return testClient.drain(done);
        });
    });

    it('should send event when error', function (done) {
        const expectedEvent = 'event-test';
        const expectedEventSource = 'event-source-test';
        const expectedEventGroupId = '1';
        const extraHeaders = {
            'Carto-Event': expectedEvent,
            'Carto-Event-Source': expectedEventSource,
            'Carto-Event-Group-Id': expectedEventGroupId
        };
        const overrideServerOptions = { pubSubMetrics: { enabled: true, topic: 'topic-test' } };
        const emptyMapConfig = {};
        const testClient = new TestClient(emptyMapConfig, apikey, extraHeaders, overrideServerOptions);
        const params = { response: { status: 400 } };

        testClient.getLayergroup(params, (err, body) => {
            if (err) {
                return done(err);
            }

            assert.ok(this.pubSubMetricsBackendSendMethodCalled);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.event, expectedEvent);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_source, expectedEventSource);
            assert.strictEqual(this.pubSubMetricsBackendSendMethodCalledWith.attributes.event_group_id, expectedEventGroupId);

            return testClient.drain(done);
        });
    });
});
