'use strict'

const http = require('http');
const { Counter, Histogram, register } = require('prom-client');
const split = require('split2');
const { Transform } = require('stream');
const DEV_ENVS = ['test', 'development'];

const requestCounter = new Counter({
    name: 'maps_api_requests_total',
    help: 'MAPS API requests total'
});

const requestOkCounter = new Counter({
    name: 'maps_api_requests_ok_total',
    help: 'MAPS API requests ok total'
});

const requestErrorCounter = new Counter({
    name: 'maps_api_requests_errors_total',
    help: 'MAPS API requests errors total'
});

const responseTimeHistogram = new Histogram({
    name: 'maps_api_response_time_total',
    help: 'MAPS API response time total'
});

const userRequestCounter = new Counter({
    name: 'maps_api_requests',
    help: 'MAPS API requests per user',
    labelNames: ['user', 'http_code']
});

const userRequestOkCounter = new Counter({
    name: 'maps_api_requests_ok',
    help: 'MAPS API requests per user with success HTTP code',
    labelNames: ['user', 'http_code']
});

const userRequestErrorCounter = new Counter({
    name: 'maps_api_requests_errors',
    help: 'MAPS API requests per user with error HTTP code',
    labelNames: ['user', 'http_code']
});

const userResponseTimeHistogram = new Histogram({
    name: 'maps_api_response_time',
    help: 'MAPS API response time total',
    labelNames: ['user']
});

module.exports = function metricsCollector () {
    return new Transform({
        transform (chunk, enc, callback) {
            let entry;

            try {
                entry = JSON.parse(chunk);
                const { level, time } = entry;

                if (level === undefined && time === undefined) {
                    throw new Error('Entry log is not valid');
                }
            } catch (e) {
                if (DEV_ENVS.includes(process.env.NODE_ENV)) {
                    this.push(chunk);
                }
                return callback();
            }

            const { request, response, stats } = entry;

            if (request === undefined || response === undefined || stats === undefined) {
                this.push(chunk + '\n');
                return callback();
            }

            const { statusCode, headers } = response;
            const { 'carto-user': user } = headers;

            if (statusCode === undefined || headers === undefined || user === undefined) {
                this.push(chunk + '\n');
                return callback();
            }

            requestCounter.inc();
            userRequestCounter.labels(user, `${statusCode}`).inc();

            if (statusCode >= 200 && statusCode < 400) {
                requestOkCounter.inc();
                userRequestOkCounter.labels(user, `${statusCode}`).inc();
            } else {
                requestErrorCounter.inc();
                userRequestErrorCounter.labels(user, `${statusCode}`).inc();
            }

            const { response: responseTime } = stats;

            if (Number.isFinite(responseTime)) {
                responseTimeHistogram.observe(responseTime);
                userResponseTimeHistogram.labels(user).observe(responseTime);
            }

            this.push(chunk);
            callback();
        }
    })
}

const port = process.env.PORT || 9144;

http
    .createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': register.contentType });
        res.end(register.metrics());
    })
    .listen(port);
