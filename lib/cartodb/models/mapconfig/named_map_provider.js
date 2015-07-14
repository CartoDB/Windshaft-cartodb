var _ = require('underscore');
var assert = require('assert');
var crypto = require('crypto');
var dot = require('dot');
var step = require('step');
var MapConfig = require('windshaft').model.MapConfig;
var templateName = require('../../backends/template_maps').templateName;

/**
 * @constructor
 * @type {NamedMapMapConfigProvider}
 */
function NamedMapMapConfigProvider(templateMaps, pgConnection, userLimitsApi, queryTablesApi,
                                   owner, templateId, config, authToken, params) {
    this.templateMaps = templateMaps;
    this.pgConnection = pgConnection;
    this.userLimitsApi = userLimitsApi;
    this.queryTablesApi = queryTablesApi;
    this.owner = owner;
    this.templateName = templateName(templateId);
    this.config = config;
    this.authToken = authToken;
    this.params = params;

    this.cacheBuster = Date.now();

    // use template after call to mapConfig
    this.template = null;

    this.affectedTablesAndLastUpdate = null;

    // providing
    this.err = null;
    this.mapConfig = null;
    this.rendererParams = null;
    this.context = {};
}

module.exports = NamedMapMapConfigProvider;

NamedMapMapConfigProvider.prototype.getMapConfig = function(callback) {
    if (!!this.err || this.mapConfig !== null) {
        return callback(this.err, this.mapConfig, this.rendererParams, this.context);
    }

    var self = this;

    var mapConfig = null;
    var rendererParams;

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
        function prepareContextLimits(err) {
            assert.ifError(err);
            self.userLimitsApi.getRenderLimits(self.owner, this);
        },
        function cacheAndReturnMapConfig(err, renderLimits) {
            self.err = err;
            self.mapConfig = (mapConfig === null) ? null : MapConfig.create(mapConfig);
            self.rendererParams = rendererParams;
            self.context.limits = renderLimits || {};
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
    return this.createKey(false);
};

NamedMapMapConfigProvider.prototype.getCacheBuster = function() {
    return this.cacheBuster;
};

NamedMapMapConfigProvider.prototype.filter = function(key) {
    var regex = new RegExp('^' + this.createKey(true) + '.*');
    return key && key.match(regex);
};

// Configure bases for cache keys suitable for string interpolation
var baseKey = '{{=it.dbname}}:{{=it.owner}}:{{=it.templateName}}';
var rendererKey = baseKey + ':{{=it.authToken}}:{{=it.configHash}}:{{=it.format}}:{{=it.layer}}:{{=it.scale_factor}}';

var baseKeyTpl = dot.template(baseKey);
var rendererKeyTpl = dot.template(rendererKey);

NamedMapMapConfigProvider.prototype.createKey = function(base) {
    var tplValues = _.defaults({}, this.params, {
        dbname: '',
        owner: this.owner,
        templateName: this.templateName,
        authToken: this.authToken || '',
        configHash: configHash(this.config),
        layer: '',
        scale_factor: 1
    });
    return (base) ? baseKeyTpl(tplValues) : rendererKeyTpl(tplValues);
};

function configHash(config) {
    if (!config) {
        return '';
    }
    return crypto.createHash('md5').update(JSON.stringify(config)).digest('hex').substring(0,8);
}

module.exports.configHash = configHash;

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

NamedMapMapConfigProvider.prototype.getAffectedTablesAndLastUpdatedTime = function(callback) {
    var self = this;

    if (this.affectedTablesAndLastUpdate !== null) {
        return callback(null, this.affectedTablesAndLastUpdate);
    }

    step(
        function getMapConfig() {
            self.getMapConfig(this);
        },
        function getSql(err, mapConfig) {
            assert.ifError(err);
            return mapConfig.getLayers().map(function(layer) {
                return layer.options.sql;
            }).join(';');
        },
        function getAffectedTables(err, sql) {
            assert.ifError(err);
            self.queryTablesApi.getAffectedTablesAndLastUpdatedTime(self.owner, sql, this);
        },
        function finish(err, result) {
            self.affectedTablesAndLastUpdate = result;
            return callback(err, result);
        }
    );
};
