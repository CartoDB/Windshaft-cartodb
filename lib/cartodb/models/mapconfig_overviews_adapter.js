var queue = require('queue-async');

function MapConfigNamedLayersAdapter(overviewsApi) {
    this.overviewsApi = overviewsApi;
}

module.exports = MapConfigNamedLayersAdapter;

MapConfigNamedLayersAdapter.prototype.getMapConfig = function(username, mapconfig, callback) {

    // TODO: we're modifying mapconfig in place and then returning it... not very nice

    var layers = mapconfig.getlayers();

    var parallelism = 2;
    var q = queue(parallelism);

    for ( var i=0; i < layers.length; ++i ) {
        q.defer(function(layer, done){
            this.overviewsApi.getOverviewsMetadata(username, layer.options.sql, function(err, metadata){
                 // TODO: is it legit to modify layer like this?
                 layer.options.overviews = metadata;
                 done(null);
            });
        }, layers[i]);
    };

    q.awaitAll(function(err){
      if (err) {
          return callback(err);
      } else {
          return callback(null, mapconfig);
      }
    });
};

// TODO: document in https://github.com/CartoDB/Windshaft/blob/master/doc/MapConfig-1.5.0.md
// (as OPTIONAL)
//  overviews: { table_name: { zoom_level: { table: overview_table_name } }}
