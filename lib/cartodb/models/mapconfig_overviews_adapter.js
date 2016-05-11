var queue = require('queue-async');
var _ = require('underscore');

function MapConfigOverviewsAdapter(overviewsMetadataApi) {
    this.overviewsMetadataApi = overviewsMetadataApi;
}

module.exports = MapConfigOverviewsAdapter;

MapConfigOverviewsAdapter.prototype.getLayers = function(username, layers, analysesResults, callback) {
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
               var query_rewrite_data = { overviews: metadata };
               if ( layer.options.source && analysesResults ) {
                   var sourceId = layer.options.source.id;
                   var node = _.find(analysesResults, function(a){ a.rootNode.params.id === sourceId });
                   if ( node ) {
                       node = node.roorNode;
                       var filters = node.filters; // TODO: node.getFilters() when available in camshaft
                       var filters_disabler = _.keys(filters).reduce(function(disabler, filter_id){ disabler[filter_id] = false; return disabler; }, {});
                       var unfiltered_query = node.getQuery(filters_disabler);
                       query_rewrite_data.filters = filters;
                       query_rewrite_data.unfiltered_query = unfiltered_query;
                   }
               }
               if ( !_.isEmpty(metadata) ) {
                   layer = _.extend({}, layer);
                   layer.options = _.extend({}, layer.options, { query_rewrite_data: query_rewrite_data });
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
        return callback(new Error('Missing layers array from layergroup config'));
    }

    return callback(null, layers);
  }

  layers.forEach(function(layer) {
      augmentLayersQueue.defer(augmentLayer, layer);
  });
  augmentLayersQueue.awaitAll(layersAugmentQueueFinish);

};
