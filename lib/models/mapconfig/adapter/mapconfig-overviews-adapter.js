'use strict';

var queue = require('queue-async');
var _ = require('underscore');
const AggregationMapConfig = require('../../aggregation/aggregation-mapconfig');

function MapConfigOverviewsAdapter (overviewsMetadataBackend, filterStatsBackend) {
    this.overviewsMetadataBackend = overviewsMetadataBackend;
    this.filterStatsBackend = filterStatsBackend;
}

module.exports = MapConfigOverviewsAdapter;

MapConfigOverviewsAdapter.prototype.getMapConfig = function (user, requestMapConfig, params, context, callback) {
    var layers = requestMapConfig.layers;
    var analysesResults = context.analysesResults;

    const aggMapConfig = new AggregationMapConfig(null, requestMapConfig);
    if (aggMapConfig.isVectorOnlyMapConfig() || aggMapConfig.isAggregationMapConfig() ||
        !layers || layers.length === 0) {
        return callback(null, requestMapConfig);
    }

    var augmentLayersQueue = queue(layers.length);

    layers.forEach(layer => augmentLayersQueue.defer(this._augmentLayer.bind(this), user, layer, analysesResults));

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

MapConfigOverviewsAdapter.prototype._augmentLayer = function (user, layer, analysesResults, callback) {
    if (layer.type !== 'mapnik' && layer.type !== 'cartodb') {
        return callback(null, layer);
    }

    this.overviewsMetadataBackend.getOverviewsMetadata(user, layer.options.sql, (err, metadata) => {
        if (err) {
            return callback(err);
        }

        if (_.isEmpty(metadata)) {
            return callback(null, layer);
        }

        var filters = getFilters(analysesResults, layer);

        if (!filters) {
            layer.options = Object.assign({}, layer.options, getQueryRewriteData(layer, analysesResults, {
                overviews: metadata
            }));

            return callback(null, layer);
        }

        var unfilteredQuery = getUnfilteredQuery(analysesResults, layer);

        this.filterStatsBackend.getFilterStats(user, unfilteredQuery, filters, function (err, stats) {
            if (err) {
                return callback(null, layer);
            }

            layer.options = Object.assign({}, layer.options, getQueryRewriteData(layer, analysesResults, {
                overviews: metadata,
                filter_stats: stats
            }));

            return callback(null, layer);
        });
    });
};

function getRootNode (analysesResults, sourceId) {
    var node = _.find(analysesResults, function (a) {
        return a.rootNode.params.id === sourceId;
    });

    return node ? node.rootNode : undefined;
}

function getFilters (analysesResults, layer) {
    if (layer.options.source && analysesResults && !layer.options.sql_wrap) {
        var sourceId = layer.options.source.id;
        var node = getRootNode(analysesResults, sourceId);

        if (node) {
            return node.getFilters();
        }
    }
}

function getUnfilteredQuery (analysesResults, layer) {
    if (layer.options.source && analysesResults && !layer.options.sql_wrap) {
        var sourceId = layer.options.source.id;
        var node = getRootNode(analysesResults, sourceId);

        if (node) {
            var filters = node.getFilters();
            var filtersDisabler = Object.keys(filters).reduce(function (disabler, filterId) {
                disabler[filterId] = false;
                return disabler;
            }, {});

            return node.getQuery(filtersDisabler);
        }
    }
}

function getQueryRewriteData (layer, analysesResults, extend = {}) {
    var queryRewriteData = {};

    if (layer.options.source && analysesResults && !layer.options.sql_wrap) {
        queryRewriteData.filters = getFilters(analysesResults, layer);
        queryRewriteData.unfiltered_query = getUnfilteredQuery(analysesResults, layer);
    }

    queryRewriteData = Object.assign({}, queryRewriteData, extend);

    return { query_rewrite_data: queryRewriteData };
}
