var step = require('step');
var queue = require('queue-async');
var _ = require('underscore');

function MapConfigOverviewsAdapter(overviewsMetadataApi, filterStatsApi) {
    this.overviewsMetadataApi = overviewsMetadataApi;
    this.filterStatsApi = filterStatsApi;
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
               step(
                   function collectFiltersData() {
                       var filters, unfiltered_query;
                       if ( layer.options.source && analysesResults ) {
                           var sourceId = layer.options.source.id;
                           var node = _.find(analysesResults, function(a){ return a.rootNode.params.id === sourceId; });
                           if ( node ) {
                               node = node.rootNode;
                               filters = node.filters; // TODO: node.getFilters() when available in camshaft
                               var filters_disabler = Object.keys(filters).reduce(
                                   function(disabler, filter_id){ disabler[filter_id] = false; return disabler; },
                                   {}
                               );
                               unfiltered_query = node.getQuery(filters_disabler);
                               query_rewrite_data.filters = filters;
                               query_rewrite_data.unfiltered_query = unfiltered_query;
                           }
                       }
                       this(null, filters, unfiltered_query);
                   },
                   function collectStatsData(err, filters, unfiltered_query) {
                       var next_step = this;
                       if ( filters ) {
                           self.filterStatsApi.getFilterStats(
                               username,
                               unfiltered_query, filters,
                               function(err, stats) {
                                 if ( !err ) {
                                     query_rewrite_data.filter_stats = stats;
                                 }
                                 return next_step(err);
                               }
                           );
                       } else {
                           return next_step(null);
                       }
                   },
                   function addDataToLayer(err) {
                       if ( !err && !_.isEmpty(metadata) ) {
                           layer = _.extend({}, layer);
                           layer.options = _.extend({}, layer.options, { query_rewrite_data: query_rewrite_data });
                       }
                       done(err, layer);
                   }
               );
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
