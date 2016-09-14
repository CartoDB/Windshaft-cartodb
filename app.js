var http = require('http');
var https = require('https');
var path = require('path');
var fs = require('fs');

var _ = require('underscore');

var argv = require('yargs')
    .usage('Usage: $0 <environment> [options]')
    .help('h')
    .example(
    '$0 production -c /etc/sql-api/config.js',
    'start server in production environment with /etc/sql-api/config.js as config file'
)
    .alias('h', 'help')
    .alias('c', 'config')
    .nargs('c', 1)
    .describe('c', 'Load configuration from path')
    .argv;

var environmentArg = argv._[0] || process.env.NODE_ENV || 'development';
var configurationFile = path.resolve(argv.config || './config/environments/' + environmentArg + '.js');
if (!fs.existsSync(configurationFile)) {
    console.error('Configuration file "%s" does not exist', configurationFile);
    process.exit(1);
}

global.environment = require(configurationFile);
var ENVIRONMENT = argv._[0] || process.env.NODE_ENV || global.environment.environment;
process.env.NODE_ENV = ENVIRONMENT;

// jshint undef:false
var log = console.log.bind(console);
var logError = console.error.bind(console);
// jshint undef:true

var availableEnvironments = {
    production: true,
    staging: true,
    development: true
};

// sanity check
if (!availableEnvironments[ENVIRONMENT]){
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

if ( global.environment.log_filename ) {
    var logFilename = path.resolve(global.environment.log_filename);
    var logDirectory = path.dirname(logFilename);
    if (!fs.existsSync(logDirectory)) {
        logError("Log filename directory does not exist: " + logDirectory);
        process.exit(1);
    }
    log("Logs will be written to " + logFilename);
    log4jsConfig.appenders.push(
        { type: "file", absolute: true, filename: logFilename }
    );
} else {
    log4jsConfig.appenders.push(
        { type: "console", layout: { type:'basic' } }
    );
}

global.log4js.configure(log4jsConfig);
global.logger = global.log4js.getLogger();

global.environment.api_hostname = require('os').hostname().split('.')[0];

// Include cartodb_windshaft only _after_ the "global" variable is set
// See https://github.com/Vizzuality/Windshaft-cartodb/issues/28
var cartodbWindshaft = require('./lib/cartodb/server');
var serverOptions = require('./lib/cartodb/server_options');

var server = cartodbWindshaft(serverOptions);

// Maximum number of connections for one process
// 128 is a good number if you have up to 1024 filedescriptors
// 4 is good if you have max 32 filedescriptors
// 1 is good if you have max 16 filedescriptors
var backlog = global.environment.maxConnections || 128;

var listener = server.listen(serverOptions.bind.port, serverOptions.bind.host, backlog);

var version = require("./package").version;

listener.on('listening', function() {
    log('Using configuration file "%s"', configurationFile);
    log(
        "Windshaft tileserver %s started on %s:%s PID=%d (%s)",
        version, serverOptions.bind.host, serverOptions.bind.port, process.pid, ENVIRONMENT
    );
});

setInterval(function() {
    var memoryUsage = process.memoryUsage();
    Object.keys(memoryUsage).forEach(function(k) {
        global.statsClient.gauge('windshaft.memory.' + k, memoryUsage[k]);
    });
}, 5000);

process.on('SIGHUP', function() {
    global.log4js.clearAndShutdownAppenders(function() {
        global.log4js.configure(log4jsConfig);
        global.logger = global.log4js.getLogger();
        log('Log files reloaded');
    });
});

process.on('uncaughtException', function(err) {
    global.logger.error('Uncaught exception: ' + err.stack);
});
