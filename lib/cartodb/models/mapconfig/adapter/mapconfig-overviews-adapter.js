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

function augmentLayer(overviewsMetadataBackend, filterStatsBackend, user, layer, analysesResults, callback) {
    if (layer.type !== 'mapnik' && layer.type !== 'cartodb') {
        return callback(null, layer);
    }

    var queryRewriteData = {};

    if (layer.options.source && analysesResults && !layer.options.sql_wrap) {
        var sourceId = layer.options.source.id;

        queryRewriteData.filters = getFilters(analysesResults, sourceId);
        queryRewriteData.unfiltered_query = getUnfilteredQuery(analysesResults, sourceId);
    }

    overviewsMetadataBackend.getOverviewsMetadata(user, layer.options.sql, function (err, metadata) {
        if (err) {
            return callback(err, layer);
        }

        if (_.isEmpty(metadata)) {
            return callback(null, layer);
        }

        queryRewriteData.overviews = metadata;

        var filters = queryRewriteData.filters;

        if (!filters) {
            layer.options = Object.assign({}, layer.options, { query_rewrite_data: queryRewriteData });

            return callback(null, layer);
        }

        var unfilteredQuery = queryRewriteData.unfiltered_query;

        filterStatsBackend.getFilterStats(user, unfilteredQuery, filters, function (err, stats) {
            if (err) {
                return callback(null, layer);
            }

            queryRewriteData.filter_stats = stats;

            layer.options = Object.assign({}, layer.options, { query_rewrite_data: queryRewriteData });

            return callback(null, layer);
        });
    });
}

function getRootNode (analysesResults, sourceId) {
    var node = _.find(analysesResults, function (a) {
        return a.rootNode.params.id === sourceId;
    });

    return node ? node.rootNode : undefined;
}

function getUnfilteredQuery (analysesResults, sourceId) {
    var node = getRootNode(analysesResults, sourceId);

    if (node) {
        var filters = node.getFilters();
        var filters_disabler = Object.keys(filters).reduce(function (disabler, filter_id) {
            disabler[filter_id] = false;
            return disabler;
        }, {});

        return node.getQuery(filters_disabler);
    }
}

function getFilters (analysesResults, sourceId) {
    var node = getRootNode(analysesResults, sourceId);

    if (node) {
        return node.getFilters();
    }
}
