'use strict';

const { Transform } = require('stream');
const DEV_ENVS = ['test', 'development'];

const LEVELS = {
    10: 'trace',
    20: 'debug',
    30: 'info',
    40: 'warn',
    50: 'error',
    60: 'fatal'
};

module.exports = function logParser () {
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

            if (entry.level && LEVELS[entry.level]) {
                entry.level = LEVELS[entry.level];
            }

            if (Number.isFinite(entry.time)) {
                entry.time = new Date(entry.time).toISOString();
            }

            this.push(`${JSON.stringify(entry)}\n`);

            return callback();
        }
    });
};
