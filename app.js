/*
 * Windshaft-CartoDB
 * ===============
 *
 * ./app.js [environment]
 *
 * environments: [development, production]
 */


if ( process.argv[2] ) ENV = process.argv[2];
else if ( process.env['NODE_ENV'] ) ENV = process.env['NODE_ENV'];
else ENV = 'development';

process.env['NODE_ENV'] = ENV;

// sanity check
if (ENV != 'development' && ENV != 'production' && ENV != 'staging' ){
    console.error("\nnode app.js [environment]");
    console.error("environments: development, production, staging\n");
    process.exit(1);
}

var _ = require('underscore')
    , Step       = require('step')
    ;
// set environment specific variables
global.settings     = require(__dirname + '/config/settings');
global.environment  = require(__dirname + '/config/environments/' + ENV);
_.extend(global.settings, global.environment);

global.log4js = require('log4js')
log4js_config = {
  appenders: [
    { type: "console", layout: { type:'basic' } }
  ],
  replaceConsole:true
};

if ( global.environment.rollbar ) {
  log4js_config.appenders.push({
    type: __dirname + "/lib/cartodb/log4js_rollbar.js",
    options: global.environment.rollbar
  });
}

log4js.configure(log4js_config);
global.logger = log4js.getLogger();

// Include cartodb_windshaft only _after_ the "global" variable is set
// See https://github.com/Vizzuality/Windshaft-cartodb/issues/28
var CartodbWindshaft = require('./lib/cartodb/cartodb_windshaft');
var serverOptions = require('./lib/cartodb/server_options')();

ws = CartodbWindshaft(serverOptions);

// Maximum number of connections for one process
// 128 is a good number if you have up to 1024 filedescriptors
// 4 is good if you have max 32 filedescriptors
// 1 is good if you have max 16 filedescriptors
ws.maxConnections = global.environment.maxConnections || 128;

ws.listen(global.environment.port, global.environment.host);

var version = require("./package").version;

ws.on('listening', function() {
  console.log("Windshaft tileserver " + version + " started on "
              + global.environment.host + ':' + global.environment.port
              + " (" + ENV + ")");
});

// DEPRECATED, use SIGUSR2
process.on('SIGUSR1', function() {
  console.log('WARNING: handling of SIGUSR1 by Windshaft-CartoDB is deprecated, please send SIGUSR2 instead');
  ws.dumpCacheStats();
});

process.on('SIGUSR2', function() {
  ws.dumpCacheStats();
  log4js.configure(log4js_config);
  console.log('Log files reloaded');
});

process.on('uncaughtException', function(err) {
  logger.error('Uncaught exception: ' + err.stack); 
});
