var queue = require('queue-async');
var _ = require('underscore');
var Datasource = require('windshaft').Datasource;

function MapConfigNamedLayersAdapter(templateMaps) {
    this.templateMaps = templateMaps;
}

module.exports = MapConfigNamedLayersAdapter;

MapConfigNamedLayersAdapter.prototype.getLayers = function(username, layers, dbMetadata, callback) {
    var self = this;

    var adaptLayersQueue = queue(layers.length);

    function adaptLayer(layer, done) {
        if (isNamedTypeLayer(layer)) {

            if (!layer.options.name) {
                return done(new Error('Missing Named Map `name` in layer options'));
            }

            var templateName = layer.options.name;
            var templateConfigParams = layer.options.config || {};
            var templateAuthTokens = layer.options.auth_tokens;

            self.templateMaps.getTemplate(username, templateName, function(err,  template) {
                if (err || !template) {
                    return done(new Error("Template '" + templateName + "' of user '" + username + "' not found"));
                }

                if (self.templateMaps.isAuthorized(template, templateAuthTokens)) {
                    var nestedNamedLayers = template.layergroup.layers.filter(function(layer) {
                        return layer.type === 'named';
                    });

                    if (nestedNamedLayers.length > 0) {
                        var nestedNamedMapsError = new Error('Nested named layers are not allowed');
                        // nestedNamedMapsError.http_status = 400;
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
                        user: dbAuth.dbuser
                    });
                }
                currentLayerIndex++;
            });

        });

        return callback(null, layers, datasourceBuilder.build());
    }


    var dbAuth = {};

    if (_.some(layers, isNamedTypeLayer)) {
        // Lazy load dbAuth
        dbMetadata.setDBAuth(username, dbAuth, function(err) {
            if (err) {
                return callback(err);
            }
            layers.forEach(function(layer) {
                adaptLayersQueue.defer(adaptLayer, layer);
            });
            adaptLayersQueue.awaitAll(layersAdaptQueueFinish);
        });
    } else {
        return callback(null, layers, datasourceBuilder.build());
    }

};

function isNamedTypeLayer(layer) {
    return layer.type === 'named';
}
