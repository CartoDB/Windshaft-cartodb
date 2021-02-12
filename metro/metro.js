'use strict';

const util = require('util');
const stream = require('stream');
const pipeline = util.promisify(stream.pipeline);
const split = require('split2');
const logCollector = require('./log-collector');
const MetricsCollector = require('./metrics-collector');

module.exports = async function metro ({ input = process.stdin, output = process.stdout, metrics = {} } = {}) {
    const metricsCollector = new MetricsCollector(metrics);
    const { stream: metricsStream } = metricsCollector;

    try {
        await metricsCollector.start();
        await pipeline(input, split(), logCollector(), metricsStream, output);
    } finally {
        await metricsCollector.stop();
    }
};
