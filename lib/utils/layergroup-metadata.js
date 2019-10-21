'use strict';

const dateWrapper = require('./date-wrapper');
const querystring = require('querystring');

module.exports = class LayergroupMetadata {
    constructor (resourceLocator) {
        this.resourceLocator = resourceLocator;
    }

    // TODO this should take into account several URL patterns
    addDataviewsAndWidgetsUrls (username, layergroup, mapConfig) {
        this._addDataviewsUrls(username, layergroup, mapConfig);
        this._addWidgetsUrl(username, layergroup, mapConfig);
    }

    _addDataviewsUrls (username, layergroup, mapConfig) {
        layergroup.metadata.dataviews = layergroup.metadata.dataviews || {};
        var dataviews = mapConfig.dataviews || {};

        Object.keys(dataviews).forEach((dataviewName) => {
            var resource = layergroup.layergroupid + '/dataview/' + dataviewName;
            layergroup.metadata.dataviews[dataviewName] = {
                url: this.resourceLocator.getUrls(username, resource)
            };
        });
    }

    _addWidgetsUrl (username, layergroup, mapConfig) {
        if (layergroup.metadata && Array.isArray(layergroup.metadata.layers) && Array.isArray(mapConfig.layers)) {
            layergroup.metadata.layers = layergroup.metadata.layers.map((layer, layerIndex) => {
                var mapConfigLayer = mapConfig.layers[layerIndex];
                if (mapConfigLayer.options && mapConfigLayer.options.widgets) {
                    layer.widgets = layer.widgets || {};
                    Object.keys(mapConfigLayer.options.widgets).forEach((widgetName) => {
                        var resource = layergroup.layergroupid + '/' + layerIndex + '/widget/' + widgetName;
                        layer.widgets[widgetName] = {
                            type: mapConfigLayer.options.widgets[widgetName].type,
                            url: this.resourceLocator.getUrls(username, resource)
                        };
                    });
                }

                return layer;
            });
        }
    }

    addAnalysesMetadata (username, layergroup, analysesResults, includeQuery) {
        includeQuery = includeQuery || false;
        analysesResults = analysesResults || [];
        layergroup.metadata.analyses = [];

        analysesResults.forEach((analysis) => {
            var nodes = analysis.getNodes();
            layergroup.metadata.analyses.push({
                nodes: nodes.reduce((nodesIdMap, node) => {
                    if (node.params.id) {
                        var nodeResource = layergroup.layergroupid + '/analysis/node/' + node.id();
                        var nodeRepr = {
                            status: node.getStatus(),
                            url: this.resourceLocator.getUrls(username, nodeResource)
                        };
                        if (includeQuery) {
                            nodeRepr.query = node.getQuery();
                        }
                        if (node.getStatus() === 'failed') {
                            nodeRepr.error_message = node.getErrorMessage();
                        }
                        nodesIdMap[node.params.id] = nodeRepr;
                    }

                    return nodesIdMap;
                }, {})
            });
        });
    }

    addAggregationContextMetadata (layergroup, mapConfig, context) {
        if (layergroup.metadata && Array.isArray(layergroup.metadata.layers) && Array.isArray(mapConfig.layers)) {
            layergroup.metadata.layers = layergroup.metadata.layers.map(function (layer, layerIndex) {
                if (context.aggregation && Array.isArray(context.aggregation.layers)) {
                    layer.meta.aggregation = context.aggregation.layers[layerIndex];
                }
                return layer;
            });
        }
    }

    addTileJsonMetadata (layergroup, user, mapconfig, userApiKey = null) {
        const isVectorOnlyMapConfig = mapconfig.isVectorOnlyMapConfig();
        let hasMapnikLayers = false;
        const apiKey = userApiKey ? '?' + querystring.stringify({ api_key: userApiKey }) : '';

        layergroup.metadata.layers.forEach((layerMetadata, index) => {
            const layerId = mapconfig.getLayerId(index);
            const rasterResource = `${layergroup.layergroupid}/${layerId}/{z}/{x}/{y}.png${apiKey}`;

            if (mapconfig.layerType(index) === 'mapnik') {
                hasMapnikLayers = true;
                const vectorResource = `${layergroup.layergroupid}/${layerId}/{z}/{x}/{y}.mvt${apiKey}`;
                const layerTilejson = {
                    vector: this._getTilejson(this.resourceLocator.getTileUrls(user, vectorResource))
                };
                if (!isVectorOnlyMapConfig) {
                    let grids = null;
                    const layer = mapconfig.getLayer(index);
                    if (layer.options.interactivity) {
                        const gridResource = `${layergroup.layergroupid}/${layerId}/{z}/{x}/{y}.grid.json${apiKey}`;
                        grids = this.resourceLocator.getTileUrls(user, gridResource);
                    }
                    layerTilejson.raster = this._getTilejson(
                        this.resourceLocator.getTileUrls(user, rasterResource),
                        grids
                    );
                }
                layerMetadata.tilejson = layerTilejson;
            } else {
                layerMetadata.tilejson = {
                    raster: this._getTilejson(this.resourceLocator.getTileUrls(user, rasterResource))
                };
            }
        });

        const tilejson = {};
        const url = {};

        if (hasMapnikLayers) {
            const vectorResource = `${layergroup.layergroupid}/{z}/{x}/{y}.mvt${apiKey}`;
            tilejson.vector = this._getTilejson(
                this.resourceLocator.getTileUrls(user, vectorResource)
            );
            url.vector = this._getTemplateUrl(this.resourceLocator.getTemplateUrls(user, vectorResource));

            if (!isVectorOnlyMapConfig) {
                const rasterResource = `${layergroup.layergroupid}/{z}/{x}/{y}.png${apiKey}`;
                tilejson.raster = this._getTilejson(
                    this.resourceLocator.getTileUrls(user, rasterResource)
                );
                url.raster = this._getTemplateUrl(this.resourceLocator.getTemplateUrls(user, rasterResource));
            }
        }

        layergroup.metadata.tilejson = tilejson;
        layergroup.metadata.url = url;
    }

    _getTilejson (tiles, grids) {
        const tilejson = {
            tilejson: '2.2.0',
            tiles: tiles.https || tiles.http
        };

        if (grids) {
            tilejson.grids = grids.https || grids.http;
        }

        return tilejson;
    }

    _getTemplateUrl (url) {
        return url.https || url.http;
    }

    addTurboCartoContextMetadata (layergroup, mapConfig, context) {
        if (layergroup.metadata && Array.isArray(layergroup.metadata.layers) && Array.isArray(mapConfig.layers)) {
            layergroup.metadata.layers = layergroup.metadata.layers.map(function (layer, layerIndex) {
                if (context.turboCarto && Array.isArray(context.turboCarto.layers)) {
                    layer.meta.cartocss_meta = context.turboCarto.layers[layerIndex];
                }
                return layer;
            });
        }
    }

    addDateWrappingMetadata (layergroup, mapConfig) {
        if (layergroup.metadata && Array.isArray(layergroup.metadata.layers) && Array.isArray(mapConfig.layers)) {
            layergroup.metadata.layers = layergroup.metadata.layers.map(function (layer, layerIndex) {
                const mapConfigLayer = mapConfig.layers[layerIndex];
                const layerOptions = mapConfigLayer.options;
                if (layerOptions.dates_as_numbers && layerOptions.sql) {
                    const wrappedColumns = dateWrapper.getColumnsWithWrappedDates(layerOptions.sql);
                    if (wrappedColumns) {
                        layer.meta.dates_as_numbers = wrappedColumns;
                    }
                }
                return layer;
            });
        }
    }
};
