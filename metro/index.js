'use strict';

const split = require('split2');
const logCollector = require('./log-collector');
const metricsCollector = require('./metrics-collector');

const streams = [process.stdin, split(), logCollector(), metricsCollector(), process.stdout]

pipeline('pipe', streams);

process.on('SIGINT', exitProcess(0));
process.on('SIGTERM', exitProcess(0));
process.on('uncaughtException', exitProcess(1));
process.on('unhandledRejection', exitProcess(1));

function pipeline (action, streams) {
    for (let index = 0; index < streams.length - 1; index++) {
        const source = streams[index];
        const destination = streams[index + 1];
        source[action](destination);
    }
}

function exitProcess (code = 0) {
    return function exitProcess (signal) {
        pipeline('unpipe', streams);
        process.exit(code);
    };
}
