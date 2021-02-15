'use strict'

const fs = require('fs');
const split = require('split2');
const assingDeep = require('assign-deep');
const { Transform } = require('stream');
const DEV_ENVS = ['test', 'development'];
const dumpPath = `${__dirname}/dump.json`;

let logs;

const LEVELS = {
    'trace': 10,
    'debug': 20,
    'info': 30,
    'warning': 40,
    'error': 50,
    'fatal': 60
};

module.exports = function logCollector () {
    const stream = new Transform({
        transform (chunk, enc, callback) {
            let entry;

            try {
                entry = JSON.parse(chunk);
                const { levelname, timestamp } = entry;


                if (levelname === undefined && timestamp === undefined) {
                    throw new Error('Entry log is not valid');
                }
            } catch (e) {
                if (DEV_ENVS.includes(process.env.NODE_ENV)) {
                    this.push(chunk + '\n');
                }
                return callback();
            }

            const { request_id: id } = entry;

            if (id === undefined) {
                this.push(`${JSON.stringify(entry)}\n`);
                return callback();
            }

            if (logs.has(id)) {
                const accEntry = logs.get(id);
                const { end } = entry;

                if (end === true) {
                    accEntry.timestamp = entry.timestamp;
                    accEntry.event_message = entry.event_message;
                    this.push(`${JSON.stringify(accEntry)}\n`);
                    logs.delete(id);
                    return callback();
                }

                if (LEVELS[accEntry.levelname] > LEVELS[entry.levelname]) {
                    delete entry.levelname;
                }

                if (hasProperty(accEntry, 'exception') && hasProperty(entry, 'exception')) {
                    logs.set(id, assingDeep({}, accEntry, entry, { exception: accEntry.exception.concat(entry.exception) }));
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
