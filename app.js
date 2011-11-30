/*
 * Windshaft-CartoDB
 * ===============
 *
 * ./app.js [environment]
 *
 * environments: [development, production]
 */


// sanity check
var ENV = process.argv[2]
if (ENV != 'development' && ENV != 'production'){
    console.error("\nnode app.js [environment]");
    console.error("environments: [development, production]\n");
    process.exit(1);
}

var _ = require('underscore')
    , Step       = require('step')
    , cartoData  = require('./lib/cartodb/carto_data')
	, CartodbWindshaft = require('./lib/cartodb/cartodb_windshaft');



// set environment specific variables
global.settings     = require(__dirname + '/config/settings');
global.environment  = require(__dirname + '/config/environments/' + ENV);
_.extend(global.settings, global.environment);

var Windshaft = require('windshaft');
var serverOptions = require('./lib/cartodb/server_options');

ws = CartodbWindshaft(serverOptions);
ws.listen(global.environment.windshaft_port);
console.log("Windshaft tileserver started on port " + global.environment.windshaft_port);




