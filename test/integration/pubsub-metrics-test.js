'use strict';

const sinon = require('sinon');
const assert = require('assert');
const redis = require('redis');
const TestClient = require('../support/test-client');
const PubSubMetricsBackend = require('../../lib/backends/pubsub-metrics');

const metricsHeaders = {
    'Carto-Event': 'test-event',
    'Carto-Event-Source': 'test',
    'Carto-Event-Group-Id': '1'
};

const tooLongField = '    If you are sending a text this long in a header you kind of deserve the worst, honestly. I mean ' +
    'this is not a header, it is almost a novel, and you do not see any Novel cookie here, right?';

const badHeaders = {
    'Carto-Event': tooLongField,
    'Carto-Event-Source': 'test',
    'Carto-Event-Group-Id': 1
};

const mapConfig = {
    version: '1.7.0',
    layers: [
        {
            options: {
                sql: 'select * FROM test_table_localhost_regular1',
                cartocss: TestClient.CARTOCSS.POINTS,
                cartocss_version: '2.3.0'
            }
        }
    ]
};

function buildEventAttributes (statusCode) {
    return {
        event_source: 'test',
        user_id: '1',
        event_group_id: '1',
        response_code: statusCode.toString(),
        source_domain: 'localhost',
        event_time: new Date().toISOString(),
        event_version: '1'
    };
}

const fakeTopic = {
    name: 'test-topic',
    publish: sinon.stub().returns(Promise.resolve())
};

const fakePubSub = {
    topic: () => fakeTopic
};

describe('pubsub metrics middleware', function () {
    let redisClient;
    let testClient;
    let clock;

    before(function () {
        redisClient = redis.createClient(global.environment.redis.port);
        clock = sinon.useFakeTimers();
        sinon.stub(PubSubMetricsBackend, 'createPubSub').returns(fakePubSub);
    });

    after(function () {
        clock.restore();
        PubSubMetricsBackend.createPubSub.restore();
        global.environment.pubSubMetrics.enabled = false;
    });

    afterEach(function (done) {
        fakeTopic.publish.resetHistory();

        redisClient.SELECT(0, () => {
            redisClient.del('user:localhost:mapviews:global');

            redisClient.SELECT(5, () => {
                redisClient.del('user:localhost:mapviews:global');
                done();
            });
        });
    });

    it('should not send event if not enabled', function (done) {
        global.environment.pubSubMetrics.enabled = false;
        testClient = new TestClient(mapConfig, 1234, metricsHeaders);

        testClient.getLayergroup((err, body) => {
            if (err) {
                return done(err);
            }

            assert.strictEqual(typeof body.metadata, 'object');
            assert(fakeTopic.publish.notCalled);
            return done();
        });
    });

    it('should not send event if headers not present', function (done) {
        global.environment.pubSubMetrics.enabled = true;
        testClient = new TestClient(mapConfig, 1234);

        testClient.getLayergroup((err, body) => {
            if (err) {
                return done(err);
            }

            assert.strictEqual(typeof body.metadata, 'object');
            assert(fakeTopic.publish.notCalled);
            return done();
        });
    });

    it('should normalized headers type and length', function (done) {
        global.environment.pubSubMetrics.enabled = true;
        const eventAttributes = buildEventAttributes(200);
        const maxLength = 100;
        const eventName = tooLongField.trim().substr(0, maxLength);

        testClient = new TestClient(mapConfig, 1234, badHeaders);

        testClient.getLayergroup((err, body) => {
            if (err) {
                return done(err);
            }

            assert.strictEqual(typeof body.metadata, 'object');
            assert(fakeTopic.publish.calledOnceWith(Buffer.from(eventName), eventAttributes));
            return done();
        });
    });

    it('should send event for map requests', function (done) {
        global.environment.pubSubMetrics.enabled = true;
        const eventAttributes = buildEventAttributes(200);
        testClient = new TestClient(mapConfig, 1234, metricsHeaders);

        testClient.getLayergroup((err, body) => {
            if (err) {
                return done(err);
            }

            assert.strictEqual(typeof body.metadata, 'object');
            assert(fakeTopic.publish.calledOnceWith(Buffer.from('test-event'), eventAttributes));
            return done();
        });
    });

    it('should send event when error', function (done) {
        global.environment.pubSubMetrics.enabled = true;
        const eventAttributes = buildEventAttributes(400);
        eventAttributes.user_id = undefined;

        testClient = new TestClient({}, 1234, metricsHeaders);

        testClient.getLayergroup(() => {
            assert(fakeTopic.publish.calledOnceWith(Buffer.from('test-event'), eventAttributes));
            assert(fakeTopic.publish.calledOnce);
            return done();
        });
    });
});
