'use strict'

const fs = require('fs');
const split = require('split2');
const assingDeep = require('assign-deep');
const { Transform } = require('stream');
const DEV_ENVS = ['test', 'development'];
const dumpPath = `${__dirname}/dump.json`;

let logs;

const LEVELS = {
    10: 'trace',
    20: 'debug',
    30: 'info',
    40: 'warn',
    50: 'error',
    60: 'fatal'
};

module.exports = function logCollector () {
    const stream = new Transform({
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
                    this.push(chunk + '\n');
                }
                return callback();
            }

            const { id } = entry;

            if (id === undefined) {
                entry.level = LEVELS[entry.level];
                this.push(`${JSON.stringify(entry)}\n`);
                return callback();
            }

            if (logs.has(id)) {
                const accEntry = logs.get(id);
                const { end } = entry;

                if (end === true) {
                    accEntry.level = LEVELS[accEntry.level];
                    accEntry.time = entry.time;
                    this.push(`${JSON.stringify(accEntry)}\n`);
                    logs.delete(id);
                    return callback();
                }

                if (accEntry.level > entry.level) {
                    delete entry.level;
                }

                if (hasProperty(accEntry, 'error') && hasProperty(entry, 'error')) {
                    logs.set(id, assingDeep({}, accEntry, entry, { error: accEntry.error.concat(entry.error) }));
                } else {
                    logs.set(id, assingDeep({}, accEntry, entry));
                }
            } else {
                logs.set(id, entry);
            }

            callback();
        }
    });

    stream.on('pipe', () => {
        if (!fs.existsSync(dumpPath)) {
            logs = new Map();
            return;
        }

        try {
            const dump = require(dumpPath);
            logs = new Map(dump);
        } catch (err) {
            console.error(`Cannot read the dump for unfinished logs: ${err}`);
            logs = new Map();
        }
    });

    stream.on('unpipe', () => {
        try {
            fs.writeFileSync(dumpPath, JSON.stringify([...logs]));
        } catch (err) {
            console.error(`Cannot create a dump for unfinished logs: ${err}`);
        }
    });

    return stream;
};

function hasProperty (obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
}
