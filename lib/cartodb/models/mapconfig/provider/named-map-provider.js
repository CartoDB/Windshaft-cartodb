const BaseMapConfigProvider = require('./base-mapconfig-adapter');
const crypto = require('crypto');
const dot = require('dot');
const MapConfig = require('windshaft').model.MapConfig;
const templateName = require('../../../backends/template_maps').templateName;

// Configure bases for cache keys suitable for string interpolation
const baseKey = '{{=it.dbname}}:{{=it.user}}:{{=it.templateName}}';
const rendererKey = baseKey + ':{{=it.authToken}}:{{=it.configHash}}:{{=it.format}}:{{=it.layer}}:{{=it.scale_factor}}';

const baseKeyTpl = dot.template(baseKey);
const rendererKeyTpl = dot.template(rendererKey);

module.exports = class NamedMapMapConfigProvider extends BaseMapConfigProvider {
    constructor (
        templateMaps,
        pgConnection,
        metadataBackend,
        userLimitsBackend,
        mapConfigAdapter,
        affectedTablesCache,
        user,
        templateId,
        config,
        authToken,
        params
    ) {
        super();
        this.templateMaps = templateMaps;
        this.pgConnection = pgConnection;
        this.metadataBackend = metadataBackend;
        this.userLimitsBackend = userLimitsBackend;
        this.mapConfigAdapter = mapConfigAdapter;

        this.user = user;
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

    getMapConfig (callback) {
        if (!!this.err || this.mapConfig !== null) {
            return callback(this.err, this.mapConfig, this.rendererParams, this.context);
        }

        this.getContext((err, context) => {
            if (err) {
                this.err = err;
                return callback(err);
            }

            let templateParams = {};

            if (this.config) {
                try {
                    templateParams = Object.prototype.toString.call(this.config) === '[object String]' ?
                        JSON.parse(this.config) :
                        this.config;
                } catch (e) {
                    const error = new Error('malformed config parameter, should be a valid JSON');
                    this.err = error;

                    return callback(err);
                }
            }

            context.templateParams = templateParams;

            this.getTemplate((err, template) => {
                if (err) {
                    this.err = err;
                    return callback(err);
                }

                let requestMapConfig;

                try {
                    requestMapConfig = this.templateMaps.instance(template, templateParams);
                } catch (err) {
                    this.err = err;
                    return callback(err);
                }

                const { user, rendererParams } = this;

                this.mapConfigAdapter.getMapConfig(
                    user, requestMapConfig, rendererParams, context, (err, mapConfig) => {
                    if (err) {
                        this.err = err;
                        return callback(err);
                    }

                    this.mapConfig = (mapConfig === null) ? null : new MapConfig(mapConfig, context.datasource);
                    this.analysesResults = context.analysesResults || [];

                    return callback(null, this.mapConfig, this.rendererParams, this.context);
                });
            });
        });
    }

    getContext (callback) {
        this.getDBParams(this.user, (err, rendererParams) => {
            if (err) {
                return callback(err);
            }

            this.rendererParams = rendererParams;

            this.metadataBackend.getUserMapKey(this.user, (err, apiKey) => {
                if (err) {
                    return callback(err);
                }

                const context = {};

                context.analysisConfiguration = {
                    user: this.user,
                    db: {
                        host: rendererParams.dbhost,
                        port: rendererParams.dbport,
                        dbname: rendererParams.dbname,
                        user: rendererParams.dbuser,
                        pass: rendererParams.dbpassword
                    },
                    batch: {
                        username: this.user,
                        apiKey: apiKey
                    }
                };

                this.userLimitsBackend.getRenderLimits(this.user, this.params.api_key, (err, renderLimits) => {
                    if (err) {
                        this.err = err;
                        return callback(err);
                    }

                    context.limits = renderLimits || {};

                    this.context = context;

                    return callback(null, context);
                });
            });
        });
    }

    getTemplate (callback) {
        if (!!this.err || this.template !== null) {
            return callback(this.err, this.template);
        }

        this.templateMaps.getTemplate(this.user, this.templateName, (err, tpl) => {
            if (err) {
                this.err = err;
                return callback(err);
            }

            if (!tpl) {
                const error = new Error(`Template '${this.templateName}' of user '${this.user}' not found`);
                error.http_status = 404;

                this.err = error;

                return callback(error);
            }

            let authorized = false;

            try {
                authorized = this.templateMaps.isAuthorized(tpl, this.authToken);
            } catch (err) {
                const error = new Error('Failed to authorize template');
                error.http_status = 403;

                this.err = error;

                return callback(error);
            }

            if (!authorized) {
                const error = new Error('Unauthorized template instantiation');
                error.http_status = 403;
                this.err = error;

                return callback(error);
            }

            this.template = tpl;

            return callback(null, this.template);
        });
    }

    getKey () {
        return this.createKey(false);
    }

    getCacheBuster () {
        return this.cacheBuster;
    }

    reset () {
        this.template = null;

        this.affectedTables = null;

        this.err = null;
        this.mapConfig = null;

        this.cacheBuster = Date.now();
    }

    filter (key) {
        const regex = new RegExp('^' + this.createKey(true) + '.*');
        return key && key.match(regex);
    }

    createKey (base) {
        const tplValues = Object.assign({
            dbname: '',
            user: this.user,
            templateName: this.templateName,
            authToken: this.authToken || '',
            configHash: configHash(this.config),
            layer: '',
            scale_factor: 1
        }, this.params);

        return (base) ? baseKeyTpl(tplValues) : rendererKeyTpl(tplValues);
    }

    getDBParams (cdbuser, callback) {
        const dbParams = Object.assign({ user: this.user }, this.params);

        this.pgConnection.getDatabaseParams(cdbuser, (err, databaseParams) => {
            if (err) {
                return callback(err);
            }

            dbParams.dbuser = databaseParams.dbuser;
            dbParams.dbpass = databaseParams.dbpass;
            dbParams.dbhost = databaseParams.dbhost;
            dbParams.dbport = databaseParams.dbport;
            dbParams.dbname = databaseParams.dbname;

            return callback(null, dbParams);
        });
    }

    getTemplateName () {
        return this.templateName;
    }
};

function configHash(config) {
    if (!config) {
        return '';
    }

    return crypto.createHash('md5').update(JSON.stringify(config)).digest('hex').substring(0,8);
}

module.exports.configHash = configHash;
