'use strict';

const http = require('http');
const { Counter, Histogram, register } = require('prom-client');
const flatten = require('flat');
const { Transform, PassThrough } = require('stream');
const DEV_ENVS = ['test', 'development'];

const factory = {
    counter: Counter,
    histogram: Histogram
};

module.exports = class MetricsCollector {
    constructor ({ port = 0, definitions } = {}) {
        this._port = port;
        this._definitions = definitions;
        this._server = null;
        this._stream = createTransformStream(this._definitions);
    }

    get stream () {
        return this._stream;
    }

    start () {
        return new Promise((resolve, reject) => {
            this._server = http.createServer((req, res) => {
                res.writeHead(200, { 'Content-Type': register.contentType });
                res.end(register.metrics());
            });

            this._server.once('error', err => reject(err));
            this._server.once('listening', () => resolve());
            this._server.listen(this._port);
        });
    }

    stop () {
        return new Promise((resolve) => {
            register.clear();
            if (!this._server) {
                return resolve();
            }

            this._server.once('close', () => {
                this._server = null;
                resolve();
            });

            this._server.close();
        });
    };
};

function createTransformStream (definitions) {
    if (typeof definitions !== 'object') {
        return new PassThrough();
    }

    const metrics = [];

    for (const { type, options, valuePath, labelPaths, shouldMeasure, measure } of definitions) {
        metrics.push({
            instance: new factory[type](options),
            valuePath,
            labelPaths,
            shouldMeasure: eval(shouldMeasure), // eslint-disable-line no-eval
            measure: eval(measure) // eslint-disable-line no-eval
        });
    }

    return new Transform({
        transform (chunk, enc, callback) {
            let entry;

            try {
                entry = JSON.parse(chunk);
            } catch (e) {
                if (DEV_ENVS.includes(process.env.NODE_ENV)) {
                    this.push(chunk + '\n');
                }
                return callback();
            }

            const flatEntry = flatten(entry);

            for (const metric of metrics) {
                const value = flatEntry[metric.valuePath];
                const labels = Array.isArray(metric.labelPaths) && metric.labelPaths.map(path => flatEntry[path]);

                if (metric.shouldMeasure({ labels, value })) {
                    metric.measure({ metric: metric.instance, labels, value });
                }
            }

            this.push(`${JSON.stringify(entry)}\n`);

            return callback();
        }
    });
}
