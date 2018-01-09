var step = require('step');
var queue = require('queue-async');
var _ = require('underscore');

function MapConfigOverviewsAdapter(overviewsMetadataApi, filterStatsApi, pgConnection) {
    this.overviewsMetadataApi = overviewsMetadataApi;
    this.filterStatsApi = filterStatsApi;
    this.pgConnection = pgConnection;
}

module.exports = MapConfigOverviewsAdapter;

MapConfigOverviewsAdapter.prototype.getMapConfig = function(user, requestMapConfig, params, context, callback) {
  var self = this;

  var layers = requestMapConfig.layers;
  var analysesResults = context.analysesResults;

  if (!layers || layers.length === 0) {
      return callback(null, requestMapConfig);
  }

  var augmentLayersQueue = queue(layers.length);

  function augmentLayer(layer, done) {
      if ( layer.type !== 'mapnik' && layer.type !== 'cartodb' ) {
          return done(null, layer);
      }

      const dbConnection = self.pgConnection.getMasterConnection(params.db);

      self.overviewsMetadataApi.getOverviewsMetadata(dbConnection, layer.options.sql, function(err, metadata){
           if (err) {
               done(err, layer);
           } else {
               var query_rewrite_data = { overviews: metadata };
               step(
                   function collectFiltersData() {
                       var filters, unfiltered_query;
                       if ( layer.options.source && analysesResults && !layer.options.sql_wrap) {
                           var sourceId = layer.options.source.id;
                           var node = _.find(analysesResults, function(a){ return a.rootNode.params.id === sourceId; });
                           if ( node ) {
                               node = node.rootNode;
                               filters = node.getFilters();
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
                       const dbConnection = self.pgConnection.getMasterConnection(params.db);
                       if ( filters ) {
                           self.filterStatsApi.getFilterStats(
                               dbConnection,
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
                       done(null, layer);
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

    requestMapConfig.layers = layers;

    return callback(null, requestMapConfig);
  }

  layers.forEach(function(layer) {
      augmentLayersQueue.defer(augmentLayer, layer);
  });
  augmentLayersQueue.awaitAll(layersAugmentQueueFinish);

};
