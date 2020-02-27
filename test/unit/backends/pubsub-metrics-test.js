'use strict';

const sinon = require('sinon');
const assert = require('assert');
const PubSubMetricsBackend = require('../../../lib/backends/pubsub-metrics');

const fakeTopic = {
    name: 'test-topic',
    publish: sinon.stub().returns(Promise.resolve())
};

const fakePubSub = {
    topic: () => fakeTopic
};

const eventAttributes = {
    event_source: 'test',
    user_id: '123',
    event_group_id: '1',
    response_code: '200',
    source_domain: 'localhost',
    event_time: new Date().toISOString(),
    event_version: '1'
};

describe('pubsub metrics backend', function () {
    it('should not send event if not enabled', function () {
        const pubSubMetricsService = new PubSubMetricsBackend(fakePubSub, false);

        pubSubMetricsService.sendEvent('test-event', eventAttributes);
        assert(fakeTopic.publish.notCalled);
    });

    it('should send event if enabled', function () {
        const pubSubMetricsService = new PubSubMetricsBackend(fakePubSub, true);

        pubSubMetricsService.sendEvent('test-event', eventAttributes);
        assert(fakeTopic.publish.calledOnceWith(Buffer.from('test-event'), eventAttributes));
    });
});
