var queue = require('queue-async');
var _ = require('underscore');

function MapConfigOverviewsAdapter(overviewsMetadataApi) {
    this.overviewsMetadataApi = overviewsMetadataApi;
}

module.exports = MapConfigOverviewsAdapter;

MapConfigOverviewsAdapter.prototype.getLayers = function(username, layers, callback) {
  var self = this;

  if (!layers || layers.length === 0) {
      return callback(null, layers);
  }

  var augmentLayersQueue = queue(layers.length);

  function augmentLayer(layer, done) {
      if ( layer.type !== 'mapnik' && layer.type !== 'cartodb' ) {
          return done(null, layer);
      }
      self.overviewsMetadataApi.getOverviewsMetadata(username, layer.options.sql, function(err, metadata){
           if (err) {
               done(err, layer);
           } else {
               if ( !_.isEmpty(metadata) ) {
                   layer = _.extend({}, layer);
                   layer.options = _.extend({}, layer.options, { query_rewrite_data: { overviews: metadata } });
               }
               done(null, layer);
           }
      });
  }

  function layersAugmentQueueFinish(err, layers) {
    if (err) {
        return callback(err);
    }

    if (!layers || layers.length === 0) {
        return callback(new Error('XX Missing layers array from layergroup config'));
    }

    return callback(null, layers);
  }

  layers.forEach(function(layer) {
      augmentLayersQueue.defer(augmentLayer, layer);
  });
  augmentLayersQueue.awaitAll(layersAugmentQueueFinish);

};
