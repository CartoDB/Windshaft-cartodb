var _ = require('underscore');
var assert = require('assert');
var step = require('step');
var templateName = require('../../backends/template_maps').templateName;

function NamedMapMapConfigProvider(templateMaps, pgConnection, owner, templateId, config, authToken, params) {
    this.templateMaps = templateMaps;
    this.pgConnection = pgConnection;
    this.owner = owner;
    this.templateId = templateId;
    this.config = config;
    this.authToken = authToken;
    this.params = params;

    // use template after call to mapConfig
    this.template = null;

    // providing
    this.err = null;
    this.mapConfig = null;
    this.rendererParams = null;
    this.context = null;
}

module.exports = NamedMapMapConfigProvider;

NamedMapMapConfigProvider.prototype.getMapConfig = function(callback) {
    if (this.err !== null || this.mapConfig !== null) {
        return callback(this.err, this.mapConfig, this.rendererParams, this.context);
    }

    var self = this;

    var mapConfig;
    var rendererParams;
    var context = {};

    step(
        function getTemplate(err) {
            assert.ifError(err);
            self.templateMaps.getTemplate(self.owner, templateName(self.templateId), this);
        },
        function checkExists(err, tpl) {
            assert.ifError(err);
            if (!tpl) {
                var notFoundErr = new Error(
                    "Template '" + templateName(self.templateId) + "' of user '" + self.owner + "' not found"
                );
                notFoundErr.http_status = 404;
                throw notFoundErr;
            }
            return tpl;
        },
        function checkAuthorized(err, tpl) {
            assert.ifError(err);

            var authorized = false;
            try {
                authorized = self.templateMaps.isAuthorized(tpl, self.authToken);
            } catch (err) {
                // we catch to add http_status
                var authorizationFailedErr = new Error('Failed to authorize template');
                authorizationFailedErr.http_status = 403;
                throw authorizationFailedErr;
            }
            if ( ! authorized ) {
                var unauthorizedErr = new Error('Unauthorized template instantiation');
                unauthorizedErr.http_status = 403;
                throw unauthorizedErr;
            }

            return tpl;
        },
        function prepareParams(err, tpl) {
            assert.ifError(err);

            self.template = tpl;

            var templateParams = {};
            if (self.config) {
                try {
                    templateParams = _.isString(self.config) ? JSON.parse(self.config) : self.config;
                } catch (e) {
                    throw new Error('malformed config parameter, should be a valid JSON');
                }
            }

            return templateParams;
        },
        function instantiateTemplate(err, templateParams) {
            assert.ifError(err);
            return self.templateMaps.instance(self.template, templateParams);
        },
        function prepareLayergroup(err, layergroup) {
            assert.ifError(err);
            mapConfig = layergroup;
            rendererParams = _.extend({}, self.params, {
                user: self.owner
            });
            self.setDBParams(self.owner, rendererParams, this);
        },
        function cacheAndReturnMapConfig(err) {
            self.err = err;
            self.mapConfig = mapConfig;
            self.rendererParams = rendererParams;
            self.context = context;
            return callback(self.err, self.mapConfig, self.rendererParams, self.context);
        }
    );
};

NamedMapMapConfigProvider.prototype.getKey = function() {
    return createKey(this.params);
};

NamedMapMapConfigProvider.prototype.getCacheBuster = function() {
    return 0;
};

NamedMapMapConfigProvider.prototype.filter = function(key) {
    var regex = new RegExp('^' + createKey(this.params, true) + '.*');
    return key && key.match(regex);
};

// Configure bases for cache keys suitable for string interpolation
var baseKey   = '<%= dbname %>:<%= owner %>:<%= templateName %>';
var renderKey = baseKey + ':<%= authToken %>:<%= configHash %>:<%= layer %>:<%= scale_factor %>';
// Create a string ID/key from a set of params
function createKey(params, base) {
    return _.template(base ? baseKey : renderKey, _.defaults({}, params, {
        dbname: '',
        owner: '',
        templateName: '',
        authToken: '',
        configHash: '',
        scale_factor: 1
    }));
}

NamedMapMapConfigProvider.prototype.setDBParams = function(cdbuser, params, callback) {
    var self = this;
    step(
        function setAuth() {
            self.pgConnection.setDBAuth(cdbuser, params, this);
        },
        function setConn(err) {
            if ( err ) throw err;
            self.pgConnection.setDBConn(cdbuser, params, this);
        },
        function finish(err) {
            callback(err);
        }
    );
};