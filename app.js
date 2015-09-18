var http = require('http');
var https = require('https');
var path = require('path');
var fs = require('fs');

var _ = require('underscore');

var ENVIRONMENT;
if ( process.argv[2] ) {
    ENVIRONMENT = process.argv[2];
} else if ( process.env.NODE_ENV ) {
    ENVIRONMENT = process.env.NODE_ENV;
} else {
    ENVIRONMENT = 'development';
}

var availableEnvironments = {
    production: true,
    staging: true,
    development: true
};

// sanity check
if (!availableEnvironments[ENVIRONMENT]){
    console.error('node app.js [environment]');
    console.error('environments: %s', Object.keys(availableEnvironments).join(', '));
    process.exit(1);
}

process.env.NODE_ENV = ENVIRONMENT;

// set environment specific variables
global.environment = require('./config/environments/' + ENVIRONMENT);

global.log4js = require('log4js');
var log4js_config = {
  appenders: [],
  replaceConsole: true
};

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

if ( global.environment.log_filename ) {
  var logdir = path.dirname(global.environment.log_filename);
  // See cwd inlog4js.configure call below
  logdir = path.resolve(__dirname, logdir);
  if ( ! fs.existsSync(logdir) ) {
    console.error("Log filename directory does not exist: " + logdir);
    process.exit(1);
  }
  console.log("Logs will be written to " + global.environment.log_filename);
  log4js_config.appenders.push(
    { type: "file", filename: global.environment.log_filename }
  );
} else {
  log4js_config.appenders.push(
    { type: "console", layout: { type:'basic' } }
  );
}

global.log4js.configure(log4js_config, { cwd: __dirname });
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
server.maxConnections = global.environment.maxConnections || 128;

var listener = server.listen(serverOptions.bind.port, serverOptions.bind.host);

var version = require("./package").version;

listener.on('listening', function() {
    console.log(
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
        global.log4js.configure(log4js_config);
        global.logger = global.log4js.getLogger();
        console.log('Log files reloaded');
    });
});

process.on('uncaughtException', function(err) {
    global.logger.error('Uncaught exception: ' + err.stack);
});
