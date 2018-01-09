var queue = require('queue-async');
var _ = require('underscore');
var Datasource = require('windshaft').model.Datasource;

function MapConfigNamedLayersAdapter(templateMaps, pgConnection) {
    this.templateMaps = templateMaps;
    this.pgConnection = pgConnection;
}

module.exports = MapConfigNamedLayersAdapter;

MapConfigNamedLayersAdapter.prototype.getMapConfig = function (user, requestMapConfig, params, context, callback) {
    var self = this;

    var layers = requestMapConfig.layers;

    if (!layers) {
        return callback(null, requestMapConfig);
    }

    var adaptLayersQueue = queue(layers.length);

    function adaptLayer(layer, done) {
        if (isNamedTypeLayer(layer)) {

            if (!layer.options.name) {
                return done(new Error('Missing Named Map `name` in layer options'));
            }

            var templateName = layer.options.name;
            var templateConfigParams = layer.options.config || {};
            var templateAuthTokens = layer.options.auth_tokens;

            self.templateMaps.getTemplate(user, templateName, function(err,  template) {
                if (err || !template) {
                    return done(new Error("Template '" + templateName + "' of user '" + user + "' not found"));
                }

                if (self.templateMaps.isAuthorized(template, templateAuthTokens)) {
                    var nestedNamedLayers = template.layergroup.layers.filter(function(layer) {
                        return layer.type === 'named';
                    });

                    if (nestedNamedLayers.length > 0) {
                        var nestedNamedMapsError = new Error('Nested named layers are not allowed');
                        return done(nestedNamedMapsError);
                    }

                    try {
                        var templateLayergroupConfig = self.templateMaps.instance(template, templateConfigParams);
                        return done(null, {
                            datasource: true,
                            layers: templateLayergroupConfig.layers
                        });
                    } catch (err) {
                        return done(err);
                    }
                } else {
                    var unauthorizedError = new Error("Unauthorized '" + templateName + "' template instantiation");
                    unauthorizedError.http_status = 403;
                    return done(unauthorizedError);
                }
            });

        } else {
            return done(null, {
                datasource: false,
                layers: [layer]
            });
        }
    }

    var datasourceBuilder = new Datasource.Builder();

    function layersAdaptQueueFinish(err, layersResults) {
        if (err) {
            return callback(err);
        }

        if (!layersResults || layersResults.length === 0) {
            return callback(new Error('Missing layers array from layergroup config'));
        }

        var layers = [],
            currentLayerIndex = 0;

        layersResults.forEach(function(layersResult) {

            layersResult.layers.forEach(function(layer) {
                layers.push(layer);
                if (layersResult.datasource) {
                    datasourceBuilder.withLayerDatasource(currentLayerIndex, {
                        user: dbConfig.user
                    });
                }
                currentLayerIndex++;
            });

        });

        requestMapConfig.layers = layers;
        context.datasource = datasourceBuilder.build();

        return callback(null, requestMapConfig);
    }

    const dbConfig = context.db;

    if (_.some(layers, isNamedTypeLayer)) {
        layers.forEach(function(layer) {
            adaptLayersQueue.defer(adaptLayer, layer);
        });
        adaptLayersQueue.awaitAll(layersAdaptQueueFinish);
    } else {
        context.datasource = datasourceBuilder.build();
        return callback(null, requestMapConfig);
    }

};

function isNamedTypeLayer(layer) {
    return layer.type === 'named';
}
