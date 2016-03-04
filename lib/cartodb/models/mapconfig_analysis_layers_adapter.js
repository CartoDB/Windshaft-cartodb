var queue = require('queue-async');
var _ = require('underscore');

var camshaft = require('camshaft');
var dot = require('dot');
dot.templateSettings.strip = false;

function MapConfigAnalysisLayersAdapter(templateMaps) {
    this.templateMaps = templateMaps;
}

module.exports = MapConfigAnalysisLayersAdapter;

var SKIP_COLUMNS = {
    'the_geom': true,
    'the_geom_webmercator': true
};

function skipColumns(columnNames) {
    return columnNames
        .filter(function(columnName) { return !SKIP_COLUMNS[columnName]; });
}

var multitypeStyleTemplate = dot.template([
    "#points['mapnik::geometry_type'=1] {",
    "  marker-fill-opacity: {{=it._opacity}};",
    "  marker-line-color: #FFF;",
    "  marker-line-width: 0.5;",
    "  marker-line-opacity: {{=it._opacity}};",
    "  marker-placement: point;",
    "  marker-type: ellipse;",
    "  marker-width: 4;",
    "  marker-fill: {{=it._color}};",
    "  marker-allow-overlap: true;",
    "}",
    "#lines['mapnik::geometry_type'=2] {",
    "  line-color: {{=it._color}};",
    "  line-width: 2;",
    "  line-opacity: {{=it._opacity}};",
    "}",
    "#polygons['mapnik::geometry_type'=3] {",
    "  polygon-fill: {{=it._color}};",
    "  polygon-opacity: {{=it._opacity}};",
    "  line-color: #FFF;",
    "  line-width: 0.5;",
    "  line-opacity: {{=it._opacity}};",
    "}"
].join('\n'));

function multiTypeStyle(color, opacity) {
    return multitypeStyleTemplate({
        _opacity: opacity || 1.0,
        _color: color || 'red'
    });
}

var layerQueryTemplate = dot.template([
    'SELECT ST_Transform(the_geom, 3857) the_geom_webmercator, {{=it._columns}}',
    'FROM ({{=it._query}}) _cdb_analysis_query'
].join('\n'));

function layerQuery(query, columnNames) {
    return layerQueryTemplate({ _query: query, _columns: skipColumns(columnNames).join(', ') });
}

function getLayer(query, columnNames, color, opacity) {
    return {
        type: 'mapnik',
        options: {
            sql: layerQuery(query, columnNames),
            cartocss: multiTypeStyle(color, opacity),
            cartocss_version: '2.3.0'
        }
    };
}

function getLayerWithStyle(query, columnNames, cartocss) {
    return {
        type: 'mapnik',
        options: {
            sql: layerQuery(query, columnNames),
            cartocss: cartocss,
            cartocss_version: '2.3.0'
        }
    };
}

MapConfigAnalysisLayersAdapter.prototype.getLayers = function(analysisConfiguration, requestMapConfig, callback) {

    if (!Array.isArray(requestMapConfig.layers)) {
        return callback(null, requestMapConfig);
    }

    function adaptLayer(layer, done) {
        if (isAnalysisTypeLayer(layer)) {

            var analysisDefinition = JSON.parse(layer.options.def);

            camshaft.create(analysisConfiguration, analysisDefinition, function(err, analysis) {
                if (err) {
                    return done(err);
                }

                var layers = [];

                analysis.getSortedNodes().reverse().forEach(function(node, i) {
                    if (node.params && node.params.debug) {
                        var layer = getLayer(node.getQuery(), node.getColumns(), '#333', 0.1 * i);
                        if (!!node.params && !!node.params.cartocss) {
                            layer = getLayerWithStyle(node.getQuery(), node.getColumns(), node.params.cartocss);
                        }
                        layers.push(layer);
                    }
                });

                layers.push(getLayerWithStyle(
                    analysis.getQuery(),
                    analysis.getRoot().getColumns(),
                    layer.options.cartocss
                ));

                return done(null, { layers: layers });
            });
        } else {
            return done(null, { layers: [layer] });
        }
    }

    function layersAdaptQueueFinish(err, layersResults) {
        if (err) {
            return callback(err);
        }

        if (!layersResults || layersResults.length === 0) {
            return callback(new Error('Missing layers array from layergroup config'));
        }

        var layers = [];
        layersResults.forEach(function(layersResult) {
            layers = layers.concat(layersResult.layers);
        });

        requestMapConfig.layers = layers;

        return callback(null, requestMapConfig);
    }

    var adaptLayersQueue = queue(requestMapConfig.layers.length);

    if (_.some(requestMapConfig.layers, isAnalysisTypeLayer)) {
        requestMapConfig.layers.forEach(function(layer) {
            adaptLayersQueue.defer(adaptLayer, layer);
        });
        adaptLayersQueue.awaitAll(layersAdaptQueueFinish);
    } else {
        return callback(null, requestMapConfig);
    }
};

function isAnalysisTypeLayer(layer) {
    return layer.type === 'analysis';
}
