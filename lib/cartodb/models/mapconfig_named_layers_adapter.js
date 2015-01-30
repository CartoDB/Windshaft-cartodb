var queue = require('queue-async');
var _ = require('underscore');

function MapConfigNamedLayersAdapter(templateMaps) {
    this.templateMaps = templateMaps;
}

module.exports = MapConfigNamedLayersAdapter;

MapConfigNamedLayersAdapter.prototype.getLayers = function(username, layers, callback) {
    var self = this;

    var adaptLayersQueue = queue(layers.length);

    function adaptLayer(layer, callback) {
        if (layer.type === 'named') {

            if (!layer.options.name) {
                return callback(new Error('Missing Named Map name in layer options'));
            }

            var templateName = layer.options.name;
            var templateConfigParams = layer.options.config || {};
            var templateAuthTokens = layer.options.auth_tokens;

            self.templateMaps.getTemplate(username, templateName, function(err,  template) {
                if (err) {
                    return callback(err);
                }

                if (self.templateMaps.isAuthorized(template, templateAuthTokens)) {
                    var nestedNamedLayers = template.layergroup.layers.filter(function(layer) {
                        return layer.type === 'named';
                    });

                    if (nestedNamedLayers.length > 0) {
                        var nestedNamedMapsError = new Error('Nested named layers are not allowed');
                        // nestedNamedMapsError.http_status = 400;
                        return callback(nestedNamedMapsError);
                    }

                    try {
                        var templateLayergroupConfig = self.templateMaps.instance(template, templateConfigParams);
                        return callback(null, templateLayergroupConfig.layers);
                    } catch (err) {
                        return callback(err);
                    }
                } else {
                    var unauthorizedError = new Error('Unauthorized template instantiation');
                    // unauthorizedError.http_status = 403;
                    return callback(unauthorizedError);
                }
            });
        } else {
            return callback(null, layer);
        }
    }

    layers.forEach(function(layer) {
        adaptLayersQueue.defer(adaptLayer, layer);
    });

    function layersAdaptQueueFinish(err, layers) {
        if (err) {
            return callback(err);
        }

        if (!layers || layers.length === 0) {
            return callback(new Error('Missing layers array from layergroup config'));
        }

        return callback(null, _.flatten(layers));
    }

    adaptLayersQueue.awaitAll(layersAdaptQueueFinish);
};
