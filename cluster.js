/*
 * Windshaft-CartoDB
 * ===============
 *
 * ./app.js [environment]
 *
 * environments: [development, production]
 */

var cluster = require('cluster');

// sanity check
var ENV = process.argv[2]
if (ENV != 'development' && ENV != 'production' && ENV != 'staging'){
    console.error("\nnode app.js [environment]");
    console.error("environments: [development, production, staging]\n");
    process.exit(1);
}

var _ = require('underscore')
    , Step       = require('step')
	, CartodbWindshaft = require('./lib/cartodb/cartodb_windshaft');
    

// set environment specific variables
global.settings     = require(__dirname + '/config/settings');
global.environment  = require(__dirname + '/config/environments/' + ENV);
_.extend(global.settings, global.environment);

// Include cart_data.js only _after_ the "global" variable is set
// See https://github.com/Vizzuality/Windshaft-cartodb/issues/28
var cartoData = require('./lib/cartodb/carto_data');

var Windshaft = require('windshaft');
var serverOptions = require('./lib/cartodb/server_options');

ws = CartodbWindshaft(serverOptions);
cluster(ws)
  .use(cluster.logger('logs'))
  .use(cluster.stats())
  .use(cluster.pidfiles('pids'))
  .set('workers', 1)
  .listen(global.environment.port, global.environment.host);

console.log("Windshaft tileserver started on port " + global.environment.port);
