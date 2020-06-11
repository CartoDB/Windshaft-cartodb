'use strict';

const split = require('split2');
const logCollector = require('./log-collector');
const metricsCollector = require('./metrics-collector');

process.stdin
    .pipe(split())
    .pipe(logCollector())
    .pipe(metricsCollector())
    .pipe(process.stdout);
