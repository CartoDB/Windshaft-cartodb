'use strict';

const { PubSub } = require('@google-cloud/pubsub');

module.exports = class PubSubMetricsBackend {
    static build () {
        if (!global.environment.pubSubMetrics || !global.environment.pubSubMetrics.enabled) {
            return new PubSubMetricsBackend(undefined, false);
        }

        const { project_id: projectId, credentials: keyFilename, topic } = global.environment.pubSubMetrics;
        const pubsub = new PubSub({ projectId, keyFilename });

        return new PubSubMetricsBackend(pubsub, topic, true);
    }

    constructor (pubSub, topic, enabled) {
        this.pubsub = pubSub;
        this.topic = topic;
        this.enabled = enabled;
    }

    isEnabled () {
        return this.enabled;
    }

    sendEvent (event, attributes) {
        if (!this.enabled) {
            return;
        }

        const data = Buffer.from(event);

        this.pubsub.topic(this.topic).publish(data, attributes)
            .then(() => {
                console.log(`PubSubTracker: event '${event}' published to '${this.topic}'`);
            })
            .catch((error) => {
                console.error(`ERROR: pubsub middleware failed to publish event '${event}': ${error.message}`);
            });
    }
};
