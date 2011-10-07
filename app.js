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
    , cartoData  = require('./lib/cartodb/carto_data');



// set environment specific variables
global.settings     = require(__dirname + '/config/settings');
global.environment  = require(__dirname + '/config/environments/' + ENV);
_.extend(global.settings, global.environment);

var Windshaft = require('windshaft');
var serverOptions = require('./lib/cartodb/server_options');

// boot
var ws = new Windshaft.Server(serverOptions);

/**
 * Helper to allow access to the layer to be used in the maps infowindow popup.
 */
ws.get(serverOptions.base_url + '/infowindow', function(req, res){
    Step(
        function(){
            serverOptions.getInfowindow(req, this);
        },
        function(err, data){
            if (err){
                res.send(err.message, 400);
            } else {
                res.send({infowindow: data}, 200);
            }
        }
    );
});

/**
 * Helper to allow access to metadata to be used in embedded maps.
 */
ws.get(serverOptions.base_url + '/map_metadata', function(req, res){
    Step(
        function(){
            serverOptions.getMapMetadata(req, this);
        },
        function(err, data){
            if (err){
                res.send(err.message, 400);
            } else {
                res.send({map_metadata: data}, 200);
            }
        }
    );
});


ws.listen(global.environment.windshaft_port);
console.log("Windshaft tileserver started on port " + global.environment.windshaft_port);




