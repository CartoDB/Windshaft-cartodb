var _ = require('underscore');
var assert = require('assert');
var crypto = require('crypto');
var dot = require('dot');
var step = require('step');
var MapConfig = require('windshaft').model.MapConfig;
var templateName = require('../../../backends/template_maps').templateName;
var QueryTables = require('cartodb-query-tables');
var SqlWrapMapConfigAdapter = require('./../adapter/sql-wrap-mapconfig-adapter');

/**
 * @constructor
 * @type {NamedMapMapConfigProvider}
 */
function NamedMapMapConfigProvider(templateMaps, pgConnection, metadataBackend, userLimitsApi,
                                   namedLayersAdapter, overviewsAdapter, turboCartoAdapter, analysisMapConfigAdapter,
                                   owner, templateId, config, authToken, params) {
    this.templateMaps = templateMaps;
    this.pgConnection = pgConnection;
    this.metadataBackend = metadataBackend;
    this.userLimitsApi = userLimitsApi;
    this.namedLayersAdapter = namedLayersAdapter;
    this.turboCartoAdapter = turboCartoAdapter;
    this.analysisMapConfigAdapter = analysisMapConfigAdapter;
    this.overviewsAdapter = overviewsAdapter;
    this.sqlWrapMapConfigAdapter = new SqlWrapMapConfigAdapter();

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
    this.analysesResults = [];
}

module.exports = NamedMapMapConfigProvider;

NamedMapMapConfigProvider.prototype.getMapConfig = function(callback) {
    if (!!this.err || this.mapConfig !== null) {
        return callback(this.err, this.mapConfig, this.rendererParams, this.context);
    }

    var self = this;

    var mapConfig = null;
    var datasource = null;
    var rendererParams;
    var apiKey;

    var user = this.owner;
    var context = {};

    step(
        function getTemplate() {
            self.getTemplate(this);
        },
        function prepareDbParams(err, tpl) {
            assert.ifError(err);
            self.template = tpl;

            rendererParams = _.extend({}, self.params, {
                user: self.owner
            });
            self.setDBParams(self.owner, rendererParams, this);
        },
        function getUserApiKey(err) {
            assert.ifError(err);
            self.metadataBackend.getUserMapKey(self.owner, this);
        },
        function prepareParams(err, _apiKey) {
            assert.ifError(err);

            apiKey = _apiKey;

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
        function prepareSqlWrap(err, requestMapConfig) {
            assert.ifError(err);
            self.sqlWrapMapConfigAdapter.getMapConfig(user, requestMapConfig, rendererParams, context, this);
        },
        function prepareAnalysisLayers(err, requestMapConfig) {
            assert.ifError(err);
            context.analysisConfiguration = {
                db: {
                    host: rendererParams.dbhost,
                    port: rendererParams.dbport,
                    dbname: rendererParams.dbname,
                    user: rendererParams.dbuser,
                    pass: rendererParams.dbpassword
                },
                batch: {
                    username: self.owner,
                    apiKey: apiKey
                }
            };

            self.analysisMapConfigAdapter.getMapConfig(user, requestMapConfig, rendererParams, context, this);
        },
        function prepareLayergroup(err, _mapConfig, analysesResults) {
            assert.ifError(err);
            var next = this;
            self.analysesResults = analysesResults || [];
            self.namedLayersAdapter.getMapConfig(self.owner, _mapConfig, rendererParams, context,
                function(err, _mapConfig, datasource) {
                    if (err) {
                        return next(err);
                    }

                    return next(null, _mapConfig, datasource);
                }
            );
        },
        function addOverviewsInformation(err, _mapConfig, datasource) {
            assert.ifError(err);
            var next = this;
            context.analysesResults = self.analysesResults;
            self.overviewsAdapter.getMapConfig(self.owner, _mapConfig, rendererParams, context,
                function(err, _mapConfig) {
                    if (err) {
                        return next(err);
                    }

                    return next(null, _mapConfig, datasource);
                }
            );
        },
        function parseTurboCarto(err, _mapConfig, datasource) {
            assert.ifError(err);
            var next = this;

            self.turboCartoAdapter.getMapConfig(self.owner, _mapConfig, rendererParams, context,
                function (err, _mapConfig) {
                    if (err) {
                        return next(err);
                    }

                    return next(null, _mapConfig, datasource);
                }
            );
        },
        function prepareContextLimits(err, _mapConfig, _datasource) {
            assert.ifError(err);
            mapConfig = _mapConfig;
            datasource = _datasource;
            self.userLimitsApi.getRenderLimits(self.owner, this);
        },
        function cacheAndReturnMapConfig(err, renderLimits) {
            self.err = err;
            self.mapConfig = (mapConfig === null) ? null : new MapConfig(mapConfig, datasource);
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

NamedMapMapConfigProvider.prototype.reset = function() {
    this.template = null;

    this.affectedTablesAndLastUpdate = null;

    this.err = null;
    this.mapConfig = null;

    this.cacheBuster = Date.now();
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
            assert.ifError(err);
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
            step(
                function getConnection() {
                    self.pgConnection.getConnection(self.owner, this);
                },
                function getAffectedTables(err, connection) {
                    assert.ifError(err);
                    QueryTables.getAffectedTablesFromQuery(connection, sql, this);
                },
                this
            );
        },
        function finish(err, result) {
            self.affectedTablesAndLastUpdate = result;
            return callback(err, result);
        }
    );
};
