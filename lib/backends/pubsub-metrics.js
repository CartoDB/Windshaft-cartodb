'use strict';

const { PubSub } = require('@google-cloud/pubsub');

module.exports = class PubSubMetricsBackend {
    constructor (options = {}) {
        const { project_id: projectId, credentials: keyFilename, topic } = options;

        this._pubsub = new PubSub({ projectId, keyFilename });
        this._topicName = topic;
    }

    send (event, attributes) {
        const data = Buffer.from(event);
        return this._pubsub.topic(this._topicName).publish(data, attributes);
    }
};
