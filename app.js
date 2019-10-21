'use strict';

var http = require('http');
var https = require('https');
var path = require('path');
var fs = require('fs');
var _ = require('underscore');
var semver = require('semver');
const setICUEnvVariable = require('./lib/utils/icu-data-env-setter');

// jshint undef:false
var log = console.log.bind(console);
var logError = console.error.bind(console);
// jshint undef:true

var nodejsVersion = process.versions.node;
const { engines } = require('./package.json');
if (!semver.satisfies(nodejsVersion, engines.node)) {
    logError(`Node version ${nodejsVersion} is not supported, please use Node.js ${engines.node}.`);
    process.exit(1);
}

// This function should be called before the require('yargs').
setICUEnvVariable();

var argv = require('yargs')
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

var environmentArg = argv._[0] || process.env.NODE_ENV || 'development';
var configurationFile = path.resolve(argv.config || './config/environments/' + environmentArg + '.js');
if (!fs.existsSync(configurationFile)) {
    logError('Configuration file "%s" does not exist', configurationFile);
    process.exit(1);
}

global.environment = require(configurationFile);
var ENVIRONMENT = argv._[0] || process.env.NODE_ENV || global.environment.environment;
process.env.NODE_ENV = ENVIRONMENT;

var availableEnvironments = {
    production: true,
    staging: true,
    development: true
};

// sanity check
if (!availableEnvironments[ENVIRONMENT]) {
    logError('node app.js [environment]');
    logError('environments: %s', Object.keys(availableEnvironments).join(', '));
    process.exit(1);
}

process.env.NODE_ENV = ENVIRONMENT;
if (global.environment.uv_threadpool_size) {
    process.env.UV_THREADPOOL_SIZE = global.environment.uv_threadpool_size;
}

// set global HTTP and HTTPS agent default configurations
// ref https://nodejs.org/api/http.html#http_new_agent_options
var agentOptions = _.defaults(global.environment.httpAgent || {}, {
    keepAlive: false,
    keepAliveMsecs: 1000,
    maxSockets: Infinity,
    maxFreeSockets: 256
});
http.globalAgent = new http.Agent(agentOptions);
https.globalAgent = new https.Agent(agentOptions);

global.log4js = require('log4js');
var log4jsConfig = {
    appenders: [],
    replaceConsole: true
};

if (global.environment.log_filename) {
    var logFilename = path.resolve(global.environment.log_filename);
    var logDirectory = path.dirname(logFilename);
    if (!fs.existsSync(logDirectory)) {
        logError('Log filename directory does not exist: ' + logDirectory);
        process.exit(1);
    }
    log('Logs will be written to ' + logFilename);
    log4jsConfig.appenders.push(
        { type: 'file', absolute: true, filename: logFilename }
    );
} else {
    log4jsConfig.appenders.push(
        { type: 'console', layout: { type: 'basic' } }
    );
}

global.log4js.configure(log4jsConfig);
global.logger = global.log4js.getLogger();

// Include cartodb_windshaft only _after_ the "global" variable is set
// See https://github.com/Vizzuality/Windshaft-cartodb/issues/28
var cartodbWindshaft = require('./lib/server');
var serverOptions = require('./lib/server-options');

var server = cartodbWindshaft(serverOptions);

// Maximum number of connections for one process
// 128 is a good number if you have up to 1024 filedescriptors
// 4 is good if you have max 32 filedescriptors
// 1 is good if you have max 16 filedescriptors
var backlog = global.environment.maxConnections || 128;

var listener = server.listen(serverOptions.bind.port, serverOptions.bind.host, backlog);

var version = require('./package').version;

listener.on('listening', function () {
    log('Using Node.js %s', process.version);
    log('Using configuration file "%s"', configurationFile);
    log(
        'Windshaft tileserver %s started on %s:%s PID=%d (%s)',
        version, serverOptions.bind.host, serverOptions.bind.port, process.pid, ENVIRONMENT
    );
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
}, 5000);

setInterval(function () {
    var memoryUsage = process.memoryUsage();
    Object.keys(memoryUsage).forEach(function (k) {
        global.statsClient.gauge('windshaft.memory.' + k, memoryUsage[k]);
    });
}, 5000);

process.on('SIGHUP', function () {
    global.log4js.clearAndShutdownAppenders(function () {
        global.log4js.configure(log4jsConfig);
        global.logger = global.log4js.getLogger();
        log('Log files reloaded');
    });
});

if (global.gc) {
    var gcInterval = Number.isFinite(global.environment.gc_interval)
        ? global.environment.gc_interval
        : 10000;

    if (gcInterval > 0) {
        setInterval(function gcForcedCycle () {
            global.gc();
        }, gcInterval);
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

addHandlers(listener, global.logger, 45000);

function addHandlers (listener, logger, killTimeout) {
    process.on('uncaughtException', exitProcess(listener, logger, killTimeout));
    process.on('unhandledRejection', exitProcess(listener, logger, killTimeout));
    process.on('ENOMEM', exitProcess(listener, logger, killTimeout));
    process.on('SIGINT', exitProcess(listener, logger, killTimeout));
    process.on('SIGTERM', exitProcess(listener, logger, killTimeout));
}

function exitProcess (listener, logger, killTimeout) {
    return function exitProcessFn (signal) {
        scheduleForcedExit(killTimeout, logger);

        let code = 0;

        if (!['SIGINT', 'SIGTERM'].includes(signal)) {
            const err = signal instanceof Error ? signal : new Error(signal);
            signal = undefined;
            code = 1;

            logger.fatal(err);
        } else {
            logger.info(`Process has received signal: ${signal}`);
        }

        logger.info(`Process is going to exit with code: ${code}`);
        listener.close(() => global.log4js.shutdown(() => process.exit(code)));
    };
}

function scheduleForcedExit (killTimeout, logger) {
    // Schedule exit if there is still ongoing work to deal with
    const killTimer = setTimeout(() => {
        logger.info('Process didn\'t close on time. Force exit');
        process.exit(1);
    }, killTimeout);

    // Don't keep the process open just for this
    killTimer.unref();
}
