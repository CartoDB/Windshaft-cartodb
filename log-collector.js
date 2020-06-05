'use strict'

const split = require('split2');
const assingDeep = require('assign-deep');
const logs = new Map();
const { Transform } = require('readable-stream');

const LEVELS = {
    10: 'trace',
    20: 'debug',
    30: 'info',
    40: 'warn',
    50: 'error',
    60: 'fatal'
}

function logTransport () {
    return new Transform({
        transform: function transform (chunk, enc, callback) {
            let entry;

            try {
                entry = JSON.parse(chunk);
            } catch (error) {
                // this.push(chunk + '\n');
                return callback();
            }

            const { id, end } = entry;

            if (id === undefined) {
                entry.level = LEVELS[entry.level];
                this.push(`${JSON.stringify(entry)}\n`);
                return callback();
            }

            if (end === true) {
                const accEntry = logs.get(id);
                accEntry.level = LEVELS[accEntry.level];
                accEntry.time = entry.time;
                this.push(`${JSON.stringify(accEntry)}\n`);
                logs.delete(id);
                return callback();
            }

            if (logs.has(id)) {
                const accEntry = logs.get(id);

                if (accEntry.level > entry.level) {
                    delete entry.level
                }

                let error;
                if (Object.prototype.hasOwnProperty.call(accEntry, 'error') && Object.prototype.hasOwnProperty.call(entry, 'error')) {
                    logs.set(id, assingDeep({}, accEntry, entry, { error: accEntry.error.concat(entry.error) }));
                } else {
                    logs.set(id, assingDeep({}, accEntry, entry));
                }
            } else {
                logs.set(id, entry);
            }

            callback();
        }
    })
}

process.stdin
    .pipe(split())
    .pipe(logTransport())
    .pipe(process.stdout);
