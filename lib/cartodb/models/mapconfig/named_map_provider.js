var _ = require('underscore');
var assert = require('assert');
var dot = require('dot');
var step = require('step');
var MapConfig = require('windshaft').model.MapConfig;
var templateName = require('../../backends/template_maps').templateName;

function NamedMapMapConfigProvider(templateMaps, pgConnection, owner, templateId, config, authToken, params) {
    this.templateMaps = templateMaps;
    this.pgConnection = pgConnection;
    this.owner = owner;
    this.templateName = templateName(templateId);
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
    if (!!this.err || this.mapConfig !== null) {
        return callback(this.err, this.mapConfig, this.rendererParams, this.context);
    }

    var self = this;

    var mapConfig = null;
    var rendererParams;
    var context = {};

    step(
        function getTemplate() {
            self.getTemplate(this);
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
            self.mapConfig = (mapConfig === null) ? null : MapConfig.create(mapConfig);
            self.rendererParams = rendererParams;
            self.context = context;
            return callback(self.err, self.mapConfig, self.rendererParams, self.context);
        }
    );
};

NamedMapMapConfigProvider.prototype.getTemplate = function(callback) {
    var self = this;

    if (!!this.err || this.template !== null) {
        return callback(this.err, this.template);
    }

    step(
        function getTemplate() {
            self.templateMaps.getTemplate(self.owner, self.templateName, this);
        },
        function checkExists(err, tpl) {
            assert.ifError(err);
            if (!tpl) {
                var notFoundErr = new Error(
                        "Template '" + self.templateName + "' of user '" + self.owner + "' not found"
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
        function cacheAndReturnTemplate(err, template) {
            self.err = err;
            self.template = template;
            return callback(self.err, self.template);
        }
    );
};

NamedMapMapConfigProvider.prototype.getKey = function() {
    return this.createKey();
};

NamedMapMapConfigProvider.prototype.getCacheBuster = function() {
    return 0;
};

NamedMapMapConfigProvider.prototype.filter = function(key) {
    var regex = new RegExp('^' + this.createKey(true) + '.*');
    return key && key.match(regex);
};

// Configure bases for cache keys suitable for string interpolation
var baseKey   = '{{=it.dbname}}:{{=it.owner}}:{{=it.templateName}}';
var rendererKey = baseKey + ':{{=it.authToken}}:{{=it.configHash}}:{{=it.format}}:{{=it.layer}}:{{=it.scale_factor}}';

var baseKeyTpl = dot.template(baseKey);
var rendererKeyTpl = dot.template(rendererKey);

NamedMapMapConfigProvider.prototype.createKey = function(base) {
    var tplValues = _.defaults({}, this.params, {
        dbname: '',
        owner: this.owner,
        templateName: this.templateName,
        authToken: this.authToken || '',
        configHash: this.config && this.config.toString() || '',
        layer: '',
        scale_factor: 1
    });
    return (base) ? baseKeyTpl(tplValues) : rendererKeyTpl(tplValues);
};

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

NamedMapMapConfigProvider.prototype.getTemplateName = function() {
    return this.templateName;
};
