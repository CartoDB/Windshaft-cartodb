'use strict';

const metro = require('./metro');
const path = require('path');
const fs = require('fs');

const { CONFIG_PATH = path.resolve(__dirname, './config.json') } = process.env;
const existsConfigFile = fs.existsSync(CONFIG_PATH);

if (!existsConfigFile) {
    exit(4)(new Error(`Wrong path for CONFIG_PATH env variable: ${CONFIG_PATH} no such file`));
}

let config;

if (existsConfigFile) {
    config = fs.readFileSync(CONFIG_PATH);
    try {
        config = JSON.parse(config);
    } catch (e) {
        exit(5)(new Error('Wrong config format: invalid JSON'));
    }
}

metro({ metrics: config && config.metrics })
    .then(exit(0))
    .catch(exit(1));

process.on('uncaughtException', exit(2));
process.on('unhandledRejection', exit(3));

function exit (code = 1) {
    return function (err) {
        if (err) {
            console.error(err);
        }

        process.exit(code);
    };
}
