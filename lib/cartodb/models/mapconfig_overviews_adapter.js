var queue = require('queue-async');
var _ = require('underscore');

function MapConfigNamedLayersAdapter(overviewsApi) {
    this.overviewsApi = overviewsApi;
}

module.exports = MapConfigNamedLayersAdapter;

MapConfigNamedLayersAdapter.prototype.getLayers = function(username, layers, callback) {

  if (!layers) {
      return callback(null);
  }

  var augmentLayersQueue = queue(layers.length);

  function augmentLayer(layer, done) {
      this.overviewsApi.getOverviewsMetadata(username, layer.options.sql, function(err, metadata){
           if ( !_.isEmpty(metadata) ) {
               layer = _.extend({}, layer, { overviews: metadata });
           }
           done(null, layer);
      });
  }

  function layersAugmentQueueFinish(err, layers) {
    if (err) {
        return callback(err);
    }

    if (!layers || layers.length === 0) {
        return callback(new Error('Missing layers array from layergroup config'));
    }

    return callback(null, layers);
  }

  layers.forEach(function(layer) {
      augmentLayersQueue.defer(augmentLayer, layer);
  });
  augmentLayersQueue.awaitAll(layersAugmentQueueFinish);

};

// TODO: document in https://github.com/CartoDB/Windshaft/blob/master/doc/MapConfig-1.5.0.md
// (as OPTIONAL)
//  overviews: { table_name: { zoom_level: { table: overview_table_name } }}
