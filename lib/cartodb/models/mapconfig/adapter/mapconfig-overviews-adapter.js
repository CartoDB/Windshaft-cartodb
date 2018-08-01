var queue = require('queue-async');
var _ = require('underscore');

function MapConfigOverviewsAdapter(overviewsMetadataBackend, filterStatsBackend) {
    this.overviewsMetadataBackend = overviewsMetadataBackend;
    this.filterStatsBackend = filterStatsBackend;
}

module.exports = MapConfigOverviewsAdapter;

MapConfigOverviewsAdapter.prototype.getMapConfig = function (user, requestMapConfig, params, context, callback) {
    var self = this;

    var layers = requestMapConfig.layers;
    var analysesResults = context.analysesResults;

    if (!layers || layers.length === 0) {
        return callback(null, requestMapConfig);
    }

    var augmentLayersQueue = queue(layers.length);

    layers.forEach(function (layer) {
        augmentLayersQueue.defer(
            augmentLayer,
            self.overviewsMetadataBackend,
            self.filterStatsBackend,
            user,
            layer,
            analysesResults
        );
    });

    augmentLayersQueue.awaitAll(function layersAugmentQueueFinish (err, layers) {
        if (err) {
            return callback(err);
        }

        if (!layers || layers.length === 0) {
            return callback(new Error('Missing layers array from layergroup config'));
        }

        requestMapConfig.layers = layers;

        return callback(null, requestMapConfig);
    });

};

function augmentLayer(overviewsMetadataBackend, filterStatsBackend, user, layer, analysesResults, done) {
    if (layer.type !== 'mapnik' && layer.type !== 'cartodb') {
        return done(null, layer);
    }

    overviewsMetadataBackend.getOverviewsMetadata(user, layer.options.sql, function (err, metadata) {
        if (err) {
            return done(err, layer);
        }

        var query_rewrite_data = { overviews: metadata };

        var filters, unfiltered_query;
        if (layer.options.source && analysesResults && !layer.options.sql_wrap) {
            var sourceId = layer.options.source.id;
            var node = _.find(analysesResults, function (a) { return a.rootNode.params.id === sourceId; });
            if (node) {
                node = node.rootNode;
                filters = node.getFilters();
                var filters_disabler = Object.keys(filters).reduce(
                    function (disabler, filter_id) { disabler[filter_id] = false; return disabler; },
                    {}
                );
                unfiltered_query = node.getQuery(filters_disabler);
                query_rewrite_data.filters = filters;
                query_rewrite_data.unfiltered_query = unfiltered_query;
            }
        }

        if (!filters) {
            if (!_.isEmpty(metadata)) {
                layer = Object.assign({}, layer);
                layer.options = Object.assign({}, layer.options, { query_rewrite_data });
            }

            return done(null, layer);
        }

        filterStatsBackend.getFilterStats(user, unfiltered_query, filters, function (err, stats) {
            if (err) {
                return done(null, layer);
            }

            query_rewrite_data.filter_stats = stats;

            if (!_.isEmpty(metadata)) {
                layer = Object.assign({}, layer);
                layer.options = Object.assign({}, layer.options, { query_rewrite_data });
            }

            return done(null, layer);
        });
    });
}
