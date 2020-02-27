'use strict';

const { PubSub } = require('@google-cloud/pubsub');

/**
 * PubSubMetricsBackend
 */
class PubSubMetricsBackend {
    static build () {
        if (!global.environment.pubSubMetrics || !global.environment.pubSubMetrics.enabled) {
            return new PubSubMetricsBackend(undefined, false);
        }

        const pubsub = PubSubMetricsBackend.createPubSub();

        return new PubSubMetricsBackend(pubsub, true);
    }

    static createPubSub () {
        const projectId = global.environment.pubSubMetrics.project_id;
        const credentials = global.environment.pubSubMetrics.credentials;
        const config = {};

        if (projectId) {
            config.projectId = projectId;
        }
        if (credentials) {
            config.keyFilename = credentials;
        }
        return new PubSub(config);
    }

    constructor (pubSub, enabled) {
        this.pubsub = pubSub;
        this.enabled = enabled;
    }

    isEnabled () {
        return this.enabled;
    }

    _getTopic () {
        const topicName = global.environment.pubSubMetrics.topic;

        return this.pubsub.topic(topicName);
    }

    sendEvent (event, attributes) {
        if (!this.enabled) {
            return;
        }

        const data = Buffer.from(event);
        const topic = this._getTopic();

        topic.publish(data, attributes)
            .then(() => {
                console.log(`PubSubTracker: event '${event}' published to '${topic.name}'`);
            })
            .catch((error) => {
                console.error(`ERROR: pubsub middleware failed to publish event '${event}': ${error.message}`);
            });
    }
}

module.exports = PubSubMetricsBackend;
