/*
 * Windshaft-CartoDB
 * ===============
 *
 * ./app.js [environment]
 *
 * environments: [development, production]
 */

var path = require('path');
var fs = require('fs');
var RedisPool = require('redis-mpool');
var _ = require('underscore');

var ENV;
if ( process.argv[2] ) {
    ENV = process.argv[2];
} else if ( process.env.NODE_ENV ) {
    ENV = process.env.NODE_ENV;
} else {
    ENV = 'development';
}

process.env.NODE_ENV = ENV;

// sanity check
if (ENV != 'development' && ENV != 'production' && ENV != 'staging' ){
    console.error("\nnode app.js [environment]");
    console.error("environments: development, production, staging\n");
    process.exit(1);
}

// set environment specific variables
global.environment  = require(__dirname + '/config/environments/' + ENV);
global.environment.api_hostname = require('os').hostname().split('.')[0];

global.log4js = require('log4js');
var log4js_config = {
  appenders: [],
  replaceConsole:true
};

if (global.environment.uv_threadpool_size) {
    process.env.UV_THREADPOOL_SIZE = global.environment.uv_threadpool_size;
}

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

var redisOpts = _.defaults(global.environment.redis, {
    name: 'windshaft',
    unwatchOnRelease: false,
    noReadyCheck: true
});
var redisPool = new RedisPool(redisOpts);

// Include cartodb_windshaft only _after_ the "global" variable is set
// See https://github.com/Vizzuality/Windshaft-cartodb/issues/28
var cartodbWindshaft = require('./lib/cartodb/cartodb_windshaft'),
    serverOptions = require('./lib/cartodb/server_options')(redisPool);

var ws = cartodbWindshaft(serverOptions);

if (global.statsClient) {
    redisPool.on('status', function(status) {
        var keyPrefix = 'windshaft.redis-pool.' + status.name + '.db' + status.db + '.';
        global.statsClient.gauge(keyPrefix + 'count', status.count);
        global.statsClient.gauge(keyPrefix + 'unused', status.unused);
        global.statsClient.gauge(keyPrefix + 'waiting', status.waiting);
    });

    setInterval(function() {
        var memoryUsage = process.memoryUsage();
        Object.keys(memoryUsage).forEach(function(k) {
            global.statsClient.gauge('windshaft.memory.' + k, memoryUsage[k]);
        });
    }, 5000);
}

// Maximum number of connections for one process
// 128 is a good number if you have up to 1024 filedescriptors
// 4 is good if you have max 32 filedescriptors
// 1 is good if you have max 16 filedescriptors
ws.maxConnections = global.environment.maxConnections || 128;

ws.listen(global.environment.port, global.environment.host);

var version = require("./package").version;

ws.on('listening', function() {
    console.log(
        "Windshaft tileserver %s started on %s:%s PID=%d (%s)",
        version, global.environment.host, global.environment.port, process.pid, ENV
    );
});

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
