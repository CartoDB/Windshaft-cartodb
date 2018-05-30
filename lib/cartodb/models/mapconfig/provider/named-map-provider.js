var _ = require('underscore');
var crypto = require('crypto');
var dot = require('dot');
var MapConfig = require('windshaft').model.MapConfig;
var templateName = require('../../../backends/template_maps').templateName;
var QueryTables = require('cartodb-query-tables');

/**
 * @constructor
 * @type {NamedMapMapConfigProvider}
 */
function NamedMapMapConfigProvider(
    templateMaps,
    pgConnection,
    metadataBackend,
    userLimitsBackend,
    mapConfigAdapter,
    affectedTablesCache,
    owner,
    templateId,
    config,
    authToken,
    params
) {
    this.templateMaps = templateMaps;
    this.pgConnection = pgConnection;
    this.metadataBackend = metadataBackend;
    this.userLimitsBackend = userLimitsBackend;
    this.mapConfigAdapter = mapConfigAdapter;

    this.owner = owner;
    this.templateName = templateName(templateId);
    this.config = config;
    this.authToken = authToken;
    this.params = params;

    this.cacheBuster = Date.now();

    // use template after call to mapConfig
    this.template = null;

    this.affectedTablesCache = affectedTablesCache;

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

    var mapConfig = null;
    var rendererParams;
    var apiKey;

    var context = {};

    this.getTemplate((err, template) => {
        if (err) {
            this.err = err;
            return callback(err);
        }

        rendererParams = _.extend({}, this.params, {
            user: this.owner
        });

        this.setDBParams(this.owner, rendererParams, (err) => {
            if (err) {
                this.err = err;
                return callback(err);
            }

            this.metadataBackend.getUserMapKey(this.owner, (err, _apiKey) => {
                if (err) {
                    this.err = err;
                    return callback(err);
                }

                apiKey = _apiKey;

                var templateParams = {};
                if (this.config) {
                    try {
                        templateParams = _.isString(this.config) ? JSON.parse(this.config) : this.config;
                    } catch (e) {
                        const error = new Error('malformed config parameter, should be a valid JSON');
                        this.err = error;
                        return callback(err);
                    }
                }

                context.templateParams = templateParams;

                let requestMapConfig;
                try {
                    requestMapConfig = this.templateMaps.instance(template, templateParams);
                } catch (err) {
                    this.err = err;
                    return callback(err);
                }

                context.analysisConfiguration = {
                    user: this.owner,
                    db: {
                        host: rendererParams.dbhost,
                        port: rendererParams.dbport,
                        dbname: rendererParams.dbname,
                        user: rendererParams.dbuser,
                        pass: rendererParams.dbpassword
                    },
                    batch: {
                        username: this.owner,
                        apiKey: apiKey
                    }
                };

                this.mapConfigAdapter.getMapConfig(this.owner, requestMapConfig, rendererParams, context, (err, _mapConfig) => {
                    if (err) {
                        this.err = err;
                        return callback(err);
                    }

                    mapConfig = _mapConfig;

                    this.userLimitsBackend.getRenderLimits(this.owner, this.params.api_key, (err, renderLimits) => {
                        if (err) {
                            this.err = err;
                            return callback(err);
                        }

                        this.mapConfig = (mapConfig === null) ? null : new MapConfig(mapConfig, context.datasource);
                        this.analysesResults = context.analysesResults || [];
                        this.rendererParams = rendererParams;
                        this.context = context;
                        this.context.limits = renderLimits || {};

                        return callback(null, this.mapConfig, this.rendererParams, this.context);
                    });
                });
            });
        });
    });
};

NamedMapMapConfigProvider.prototype.getTemplate = function(callback) {
    if (!!this.err || this.template !== null) {
        return callback(this.err, this.template);
    }

    this.templateMaps.getTemplate(this.owner, this.templateName, (err, tpl) => {
        if (err) {
            this.err = err;
            return callback(err);
        }

        if (!tpl) {
            var notFoundErr = new Error(
                    "Template '" + this.templateName + "' of user '" + this.owner + "' not found"
            );
            notFoundErr.http_status = 404;

            this.err = notFoundErr;

            return callback(notFoundErr);
        }

        var authorized = false;

        try {
            authorized = this.templateMaps.isAuthorized(tpl, this.authToken);
        } catch (err) {
            // we catch to add http_status
            var authorizationFailedErr = new Error('Failed to authorize template');
            authorizationFailedErr.http_status = 403;

            this.err = authorizationFailedErr;

            return callback(authorizationFailedErr);
        }

        if (!authorized) {
            var unauthorizedErr = new Error('Unauthorized template instantiation');
            unauthorizedErr.http_status = 403;
            this.err = unauthorizedErr;

            return callback(unauthorizedErr);
        }

        this.template = tpl;

        return callback(null, this.template);
    });
};

NamedMapMapConfigProvider.prototype.getKey = function() {
    return this.createKey(false);
};

NamedMapMapConfigProvider.prototype.getCacheBuster = function() {
    return this.cacheBuster;
};

NamedMapMapConfigProvider.prototype.reset = function() {
    this.template = null;

    this.affectedTables = null;

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
    this.pgConnection.getDatabaseParams(cdbuser, (err, databaseParams) => {
        if (err) {
            return callback(err);
        }

        params.dbuser = databaseParams.dbuser;
        params.dbpass = databaseParams.dbpass;
        params.dbhost = databaseParams.dbhost;
        params.dbport = databaseParams.dbport;
        params.dbname = databaseParams.dbname;

        callback();
    });
};

NamedMapMapConfigProvider.prototype.getTemplateName = function() {
    return this.templateName;
};

NamedMapMapConfigProvider.prototype.createAffectedTables = function(callback) {
    this.getMapConfig((err, mapConfig) => {
        if (err) {
            return callback(err);
        }

        const { dbname } = this.rendererParams;
        const token = mapConfig.id();

        const queries = [];

        mapConfig.getLayers().forEach(layer => {
            queries.push(layer.options.sql);
            if (layer.options.affected_tables) {
                layer.options.affected_tables.map(table => {
                    queries.push(`SELECT * FROM ${table} LIMIT 0`);
                });
            }
        });

        const sql = queries.length ? queries.join(';') : null;

        if (!sql) {
            return callback();
        }

        this.pgConnection.getConnection(this.owner, (err, connection) => {
            if (err) {
                return callback(err);
            }

            QueryTables.getAffectedTablesFromQuery(connection, sql, (err, affectedTables) => {
                if (err) {
                    return callback(err);
                }

                this.affectedTablesCache.set(dbname, token, affectedTables);

                callback(err, affectedTables);
            });
        });
    });
};

NamedMapMapConfigProvider.prototype.getAffectedTables = function (callback) {
    this.getMapConfig((err, mapConfig) => {
        if (err) {
            return callback(err);
        }

        const { dbname } = this.params;
        const token = mapConfig.id();

        if (this.affectedTablesCache.hasAffectedTables(dbname, token)) {
            const affectedTables = this.affectedTablesCache.get(dbname, token);
            return callback(null, affectedTables);
        }

        return this.createAffectedTables(callback);
    });
};
