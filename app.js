'use strict';

const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const semver = require('semver');
const pino = require('pino');

// TODO: research it it's still needed
const setICUEnvVariable = require('./lib/utils/icu-data-env-setter');

global.logger = pino({ base: null, level: process.env.NODE_ENV === 'test' ? 'fatal' : 'info' }, pino.destination({ sync: false }));

const { engines } = require('./package.json');
if (!semver.satisfies(process.versions.node, engines.node)) {
    global.logger.fatal(new Error(`Node version ${process.versions.node} is not supported, please use Node.js ${engines.node}.`));
    process.exit(1);
}

// This function should be called before the require('yargs').
setICUEnvVariable();

const argv = require('yargs')
    .usage('Usage: node $0 <environment> [options]')
    .help('h')
    .example(
        'node $0 production -c /etc/windshaft-cartodb/config.js',
        'start server in production environment with /etc/windshaft-cartodb/config.js as config file'
    )
    .alias('h', 'help')
    .alias('c', 'config')
    .nargs('c', 1)
    .describe('c', 'Load configuration from path')
    .argv;

const environmentArg = argv._[0] || process.env.NODE_ENV || 'development';
const configurationFile = path.resolve(argv.config || `./config/environments/${environmentArg}.js`);

if (!fs.existsSync(configurationFile)) {
    global.logger.fatal(new Error(`Configuration file ${configurationFile} does not exist`));
    process.exit(1);
}

global.environment = require(configurationFile);
const ENVIRONMENT = argv._[0] || process.env.NODE_ENV || global.environment.environment;
process.env.NODE_ENV = ENVIRONMENT;

const availableEnvironments = {
    production: true,
    staging: true,
    development: true
};

if (!availableEnvironments[ENVIRONMENT]) {
    global.logger.fatal(new Error(`Invalid environment argument, valid ones: ${Object.keys(availableEnvironments).join(', ')}`));
    process.exit(1);
}

process.env.NODE_ENV = ENVIRONMENT;
if (global.environment.uv_threadpool_size) {
    process.env.UV_THREADPOOL_SIZE = global.environment.uv_threadpool_size;
}

// set global HTTP and HTTPS agent default configurations
// ref https://nodejs.org/api/http.html#http_new_agent_options
const agentOptions = Object.assign({
    keepAlive: false,
    keepAliveMsecs: 1000,
    maxSockets: Infinity,
    maxFreeSockets: 256
}, global.environment.httpAgent || {});

http.globalAgent = new http.Agent(agentOptions);
https.globalAgent = new https.Agent(agentOptions);

// Include cartodb_windshaft only _after_ the "global" variable is set
// See https://github.com/Vizzuality/Windshaft-cartodb/issues/28
const cartodbWindshaft = require('./lib/server');
const serverOptions = require('./lib/server-options');

const server = cartodbWindshaft(serverOptions);

// Specify the maximum length of the queue of pending connections for the HTTP server.
// The actual length will be determined by the OS through sysctl settings such as tcp_max_syn_backlog and somaxconn on Linux.
// The default value of this parameter is 511 (not 512).
// See: https://nodejs.org/docs/latest/api/net.html#net_server_listen
const backlog = global.environment.maxConnections || 128;

const listener = server.listen(serverOptions.bind.port, serverOptions.bind.host, backlog);
const version = require('./package').version;

listener.on('listening', function () {
    global.logger.info(`Using Node.js ${process.version}`);
    global.logger.info(`Using configuration file ${configurationFile}`);
    const { address, port } = listener.address();
    global.logger.info(`Windshaft tileserver ${version} started on ${address}:${port} PID=${process.pid} (${ENVIRONMENT})`);
});

function getCPUUsage (oldUsage) {
    let usage;

    if (oldUsage && oldUsage._start) {
        usage = Object.assign({}, process.cpuUsage(oldUsage._start.cpuUsage));
        usage.time = Date.now() - oldUsage._start.time;
    } else {
        usage = Object.assign({}, process.cpuUsage());
        usage.time = process.uptime() * 1000; // s to ms
    }

    usage.percent = (usage.system + usage.user) / (usage.time * 10);

    Object.defineProperty(usage, '_start', {
        value: {
            cpuUsage: process.cpuUsage(),
            time: Date.now()
        }
    });

    return usage;
}

let previousCPUUsage = getCPUUsage();
setInterval(function cpuUsageMetrics () {
    const CPUUsage = getCPUUsage(previousCPUUsage);

    Object.keys(CPUUsage).forEach(property => {
        global.statsClient.gauge(`windshaft.cpu.${property}`, CPUUsage[property]);
    });

    previousCPUUsage = CPUUsage;
}, 5000).unref();

setInterval(function () {
    var memoryUsage = process.memoryUsage();
    Object.keys(memoryUsage).forEach(function (k) {
        global.statsClient.gauge('windshaft.memory.' + k, memoryUsage[k]);
    });
}, 5000).unref();

if (global.gc) {
    var gcInterval = Number.isFinite(global.environment.gc_interval)
        ? global.environment.gc_interval
        : 10000;

    if (gcInterval > 0) {
        setInterval(function gcForcedCycle () {
            global.gc();
        }, gcInterval).unref();
    }
}

const gcStats = require('gc-stats')();

gcStats.on('stats', function ({ pauseMS, gctype }) {
    global.statsClient.timing('windshaft.gc', pauseMS);
    global.statsClient.timing(`windshaft.gctype.${getGCTypeValue(gctype)}`, pauseMS);
});

function getGCTypeValue (type) {
    // 1: Scavenge (minor GC)
    // 2: Mark/Sweep/Compact (major GC)
    // 4: Incremental marking
    // 8: Weak/Phantom callback processing
    // 15: All
    let value;

    switch (type) {
    case 1:
        value = 'Scavenge';
        break;
    case 2:
        value = 'MarkSweepCompact';
        break;
    case 4:
        value = 'IncrementalMarking';
        break;
    case 8:
        value = 'ProcessWeakCallbacks';
        break;
    case 15:
        value = 'All';
        break;
    default:
        value = 'Unkown';
        break;
    }

    return value;
}

const exitProcess = pino.final(global.logger, (err, logger, listener, signal, killTimeout) => {
    scheduleForcedExit(killTimeout, logger);

    logger.info(`Process has received signal: ${signal}`);

    let code = 0;

    if (err) {
        code = 1;
        logger.fatal(err);
    }

    logger.info(`Process is going to exit with code: ${code}`);
    listener.close(() => process.exit(code));
});

function addHandlers (listener, killTimeout) {
    process.on('uncaughtException', (err) => exitProcess(err, listener, 'uncaughtException', killTimeout));
    process.on('unhandledRejection', (err) => exitProcess(err, listener, 'unhandledRejection', killTimeout));
    process.on('ENOMEM', (err) => exitProcess(err, listener, 'ENOMEM', killTimeout));
    process.on('SIGINT', () => exitProcess(null, listener, 'SIGINT', killTimeout));
    process.on('SIGTERM', () => exitProcess(null, listener, 'SIGINT', killTimeout));
}

addHandlers(listener, 45000);

function scheduleForcedExit (killTimeout, logger) {
    // Schedule exit if there is still ongoing work to deal with
    const killTimer = setTimeout(() => {
        global.logger.info('Process didn\'t close on time. Force exit');
        process.exit(1);
    }, killTimeout);

    // Don't keep the process open just for this
    killTimer.unref();
}
