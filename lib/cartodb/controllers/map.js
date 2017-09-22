var _ = require('underscore');
var assert = require('assert');
var step = require('step');
var windshaft = require('windshaft');
var QueryTables = require('cartodb-query-tables');

var ResourceLocator = require('../models/resource-locator');

var util = require('util');
var BaseController = require('./base');

var cors = require('../middleware/cors');
var userMiddleware = require('../middleware/user');

var MapConfig = windshaft.model.MapConfig;
var Datasource = windshaft.model.Datasource;

var NamedMapsCacheEntry = require('../cache/model/named_maps_entry');

var NamedMapMapConfigProvider = require('../models/mapconfig/provider/named-map-provider');
var CreateLayergroupMapConfigProvider = require('../models/mapconfig/provider/create-layergroup-provider');

const prepareContextMiddleware = require('../middleware/prepare-context');

/**
 * @param {AuthApi} authApi
 * @param {PgConnection} pgConnection
 * @param {TemplateMaps} templateMaps
 * @param {MapBackend} mapBackend
 * @param metadataBackend
 * @param {SurrogateKeysCache} surrogateKeysCache
 * @param {UserLimitsApi} userLimitsApi
 * @param {LayergroupAffectedTables} layergroupAffectedTables
 * @param {MapConfigAdapter} mapConfigAdapter
 * @param {StatsBackend} statsBackend
 * @constructor
 */
function MapController(authApi, pgConnection, templateMaps, mapBackend, metadataBackend,
                       surrogateKeysCache, userLimitsApi, layergroupAffectedTables, mapConfigAdapter,
                       statsBackend) {

    BaseController.call(this, authApi, pgConnection);

    this.pgConnection = pgConnection;
    this.templateMaps = templateMaps;
    this.mapBackend = mapBackend;
    this.metadataBackend = metadataBackend;
    this.surrogateKeysCache = surrogateKeysCache;
    this.userLimitsApi = userLimitsApi;
    this.layergroupAffectedTables = layergroupAffectedTables;

    this.mapConfigAdapter = mapConfigAdapter;
    this.resourceLocator = new ResourceLocator(global.environment);

    this.statsBackend = statsBackend;
    this.prepareContext = prepareContextMiddleware(authApi, pgConnection);
}

util.inherits(MapController, BaseController);

module.exports = MapController;


MapController.prototype.register = function(app) {
    app.get(
        app.base_url_mapconfig,
        cors(),
        userMiddleware,
        this.prepareContext,
        this.createGet.bind(this)
    );
    app.post(
        app.base_url_mapconfig,
        cors(),
        userMiddleware,
        this.prepareContext,
        this.createPost.bind(this)
    );
    app.get(
        app.base_url_templated + '/:template_id/jsonp',
        cors(),
        userMiddleware,
        this.prepareContext,
        this.jsonp.bind(this)
    );
    app.post(
        app.base_url_templated + '/:template_id',
        cors(),
        userMiddleware,
        this.prepareContext,
        this.instantiate.bind(this)
    );
    app.options(app.base_url_mapconfig, cors('Content-Type'));
};

MapController.prototype.createGet = function(req, res, next){
    req.profiler.start('windshaft.createmap_get');

    this.create(req, res, function createGet$prepareConfig(req) {
        if ( ! req.params.config ) {
            throw new Error('layergroup GET needs a "config" parameter');
        }
        return JSON.parse(req.params.config);
    }, next);
};

MapController.prototype.createPost = function(req, res, next) {
    req.profiler.start('windshaft.createmap_post');

    this.create(req, res, function createPost$prepareConfig(req) {
        if (!req.is('application/json')) {
            throw new Error('layergroup POST data must be of type application/json');
        }
        return req.body;
    }, next);
};

MapController.prototype.instantiate = function(req, res, next) {
    req.profiler.start('windshaft-cartodb.instance_template_post');

    this.instantiateTemplate(req, res, function prepareTemplateParams(callback) {
        if (!req.is('application/json')) {
            return callback(new Error('Template POST data must be of type application/json'));
        }
        return callback(null, req.body);
    }, next);
};

MapController.prototype.jsonp = function(req, res, next) {
    req.profiler.start('windshaft-cartodb.instance_template_get');

    this.instantiateTemplate(req, res, function prepareJsonTemplateParams(callback) {
        var err = null;
        if ( req.query.callback === undefined || req.query.callback.length === 0) {
            err = new Error('callback parameter should be present and be a function name');
        }

        var templateParams = {};
        if (req.query.config) {
            try {
                templateParams = JSON.parse(req.query.config);
            } catch(e) {
                err = new Error('Invalid config parameter, should be a valid JSON');
            }
        }

        return callback(err, templateParams);
    }, next);
};

MapController.prototype.create = function(req, res, prepareConfigFn, next) {
    var self = this;

    var mapConfig;

    var context = {};

    step(
        function prepareConfig () {
            const requestMapConfig = prepareConfigFn(req);
            return requestMapConfig;
        },
        function prepareAdapterMapConfig(err, requestMapConfig) {
            assert.ifError(err);
            context.analysisConfiguration = {
                user: req.context.user,
                db: {
                    host: req.params.dbhost,
                    port: req.params.dbport,
                    dbname: req.params.dbname,
                    user: req.params.dbuser,
                    pass: req.params.dbpassword
                },
                batch: {
                    username: req.context.user,
                    apiKey: req.params.api_key
                }
            };
            self.mapConfigAdapter.getMapConfig(req.context.user, requestMapConfig, req.params, context, this);
        },
        function createLayergroup(err, requestMapConfig) {
            assert.ifError(err);
            var datasource = context.datasource || Datasource.EmptyDatasource();
            mapConfig = new MapConfig(requestMapConfig, datasource);
            self.mapBackend.createLayergroup(
                mapConfig, req.params,
                new CreateLayergroupMapConfigProvider(mapConfig, req.context.user, self.userLimitsApi, req.params),
                this
            );
        },
        function afterLayergroupCreate(err, layergroup) {
            assert.ifError(err);
            self.afterLayergroupCreate(req, res, mapConfig, layergroup, context.analysesResults, this);
        },
        function finish(err, layergroup) {
            if (err) {
                if (Number.isFinite(err.layerIndex)) {
                    var error = new Error(err.message);
                    error.http_status = err.http_status;

                    if (!err.http_status && err.message.indexOf('column "the_geom_webmercator" does not exist') >= 0) {
                        error.http_status = 400;
                    }

                    error.type = 'layer';
                    error.subtype = err.message.indexOf('Postgis Plugin') >= 0 ? 'query' : undefined;
                    error.layer = {
                        id: mapConfig.getLayerId(err.layerIndex),
                        index: err.layerIndex,
                        type: mapConfig.layerType(err.layerIndex)
                    };

                    err = error;
                }
                err.label = 'ANONYMOUS LAYERGROUP';
                next(err);
            } else {
                var analysesResults = context.analysesResults || [];
                self.addDataviewsAndWidgetsUrls(req.context.user, layergroup, mapConfig.obj());
                self.addAnalysesMetadata(req.context.user, layergroup, analysesResults, true);
                addContextMetadata(layergroup, mapConfig.obj(), context);
                res.set('X-Layergroup-Id', layergroup.layergroupid);
                self.send(req, res, layergroup, 200);
            }
        }
    );
};

function addContextMetadata(layergroup, mapConfig, context) {
    if (layergroup.metadata && Array.isArray(layergroup.metadata.layers) && Array.isArray(mapConfig.layers)) {
        layergroup.metadata.layers = layergroup.metadata.layers.map(function(layer, layerIndex) {
            if (context.turboCarto && Array.isArray(context.turboCarto.layers)) {
                layer.meta.cartocss_meta = context.turboCarto.layers[layerIndex];
            }
            return layer;
        });
    }
}

MapController.prototype.instantiateTemplate = function(req, res, prepareParamsFn, next) {
    var self = this;

    var cdbuser = req.context.user;

    var mapConfigProvider;
    var mapConfig;
    step(
        function getTemplateParams() {
            prepareParamsFn(this);
        },
        function getTemplate(err, templateParams) {
            assert.ifError(err);
            mapConfigProvider = new NamedMapMapConfigProvider(
                self.templateMaps,
                self.pgConnection,
                self.metadataBackend,
                self.userLimitsApi,
                self.mapConfigAdapter,
                cdbuser,
                req.params.template_id,
                templateParams,
                req.query.auth_token,
                req.params
            );
            mapConfigProvider.getMapConfig(this);
        },
        function createLayergroup(err, mapConfig_, rendererParams) {
            assert.ifError(err);
            mapConfig = mapConfig_;
            self.mapBackend.createLayergroup(
                mapConfig, rendererParams,
                new CreateLayergroupMapConfigProvider(mapConfig, cdbuser, self.userLimitsApi, rendererParams),
                this
            );
        },
        function afterLayergroupCreate(err, layergroup) {
            assert.ifError(err);
            self.afterLayergroupCreate(req, res, mapConfig, layergroup,
                                       mapConfigProvider.analysesResults,
                                       this);
        },
        function finishTemplateInstantiation(err, layergroup) {
            if (err) {
                err.label = 'NAMED MAP LAYERGROUP';
                next(err);
            } else {
                var templateHash = self.templateMaps.fingerPrint(mapConfigProvider.template).substring(0, 8);
                layergroup.layergroupid = cdbuser + '@' + templateHash + '@' + layergroup.layergroupid;

                var _mapConfig = mapConfig.obj();
                self.addDataviewsAndWidgetsUrls(cdbuser, layergroup, _mapConfig);
                self.addAnalysesMetadata(cdbuser, layergroup, mapConfigProvider.analysesResults);
                addContextMetadata(layergroup, _mapConfig, mapConfigProvider.context);

                res.set('X-Layergroup-Id', layergroup.layergroupid);
                self.surrogateKeysCache.tag(res, new NamedMapsCacheEntry(cdbuser, mapConfigProvider.getTemplateName()));

                self.send(req, res, layergroup, 200);
            }
        }
    );
};

MapController.prototype.afterLayergroupCreate =
function(req, res, mapconfig, layergroup, analysesResults, callback) {
    var self = this;

    var username = req.context.user;

    var tasksleft = 2; // redis key and affectedTables
    var errors = [];

    var done = function(err) {
        if ( err ) {
            errors.push('' + err);
        }
        if ( ! --tasksleft ) {
            err = errors.length ? new Error(errors.join('\n')) : null;
            callback(err, layergroup);
        }
    };

    // include in layergroup response the variables in serverMedata
    // those variables are useful to send to the client information
    // about how to reach this server or information about it
    _.extend(layergroup, global.environment.serverMetadata);

    // Don't wait for the mapview count increment to
    // take place before proceeding. Error will be logged
    // asynchronously
    this.metadataBackend.incMapviewCount(username, mapconfig.obj().stat_tag, function(err) {
        req.profiler.done('incMapviewCount');
        if ( err ) {
            global.logger.log("ERROR: failed to increment mapview count for user '" + username + "': " + err);
        }
        done();
    });

    var sql = [];
    mapconfig.getLayers().forEach(function(layer) {
        sql.push(layer.options.sql);
        if (layer.options.affected_tables) {
            layer.options.affected_tables.map(function(table) {
                sql.push('SELECT * FROM ' + table + ' LIMIT 0');
            });
        }
    });

    var dbName = req.params.dbname;
    var layergroupId = layergroup.layergroupid;
    var dbConnection;

    step(
        function getPgConnection() {
            self.pgConnection.getConnection(username, this);
        },
        function getAffectedTablesAndLastUpdatedTime(err, connection) {
            assert.ifError(err);
            dbConnection = connection;
            QueryTables.getAffectedTablesFromQuery(dbConnection, sql.join(';'), this);
        },
        function handleAffectedTablesAndLastUpdatedTime(err, result) {
            req.profiler.done('queryTablesAndLastUpdated');
            assert.ifError(err);
            // feed affected tables cache so it can be reused from, for instance, layergroup controller
            self.layergroupAffectedTables.set(dbName, layergroupId, result);

            var lastUpdateTime = result.getLastUpdatedAt();
            lastUpdateTime = getLastUpdatedTime(analysesResults, lastUpdateTime) || lastUpdateTime;

            // last update for layergroup cache buster
            layergroup.layergroupid = layergroup.layergroupid + ':' + lastUpdateTime;
            layergroup.last_updated = new Date(lastUpdateTime).toISOString();

            if (req.method === 'GET') {
                var ttl = global.environment.varnish.layergroupTtl || 86400;
                res.set('Cache-Control', 'public,max-age='+ttl+',must-revalidate');
                res.set('Last-Modified', (new Date()).toUTCString());
                res.set('X-Cache-Channel', result.getCacheChannel());
                if (result.tables && result.tables.length > 0) {
                    self.surrogateKeysCache.tag(res, result);
                }
            }

            return null;
        },
        function fetchLayersStats(err) {
            assert.ifError(err);
            var next = this;
            self.statsBackend.getStats(mapconfig, dbConnection, function(err, layersStats) {
                if (err) {
                    return next(err);
                }
                if (layersStats.length > 0) {
                    layergroup.metadata.layers.forEach(function (layer, index) {
                        layer.meta.stats = layersStats[index];
                    });
                }
                return next();
            });
        },
        function finish(err) {
            done(err);
        }
    );
};

function getLastUpdatedTime(analysesResults, lastUpdateTime) {
    if (!Array.isArray(analysesResults)) {
        return lastUpdateTime;
    }
    return analysesResults.reduce(function(lastUpdateTime, analysis) {
        return analysis.getNodes().reduce(function(lastNodeUpdatedAtTime, node) {
            var nodeUpdatedAtDate = node.getUpdatedAt();
            var nodeUpdatedTimeAt = (nodeUpdatedAtDate && nodeUpdatedAtDate.getTime()) || 0;
            return nodeUpdatedTimeAt > lastNodeUpdatedAtTime ? nodeUpdatedTimeAt : lastNodeUpdatedAtTime;
        }, lastUpdateTime);
    }, lastUpdateTime);
}

MapController.prototype.addAnalysesMetadata = function(username, layergroup, analysesResults, includeQuery) {
    includeQuery = includeQuery || false;
    analysesResults = analysesResults || [];
    layergroup.metadata.analyses = [];

    analysesResults.forEach(function(analysis) {
        var nodes = analysis.getNodes();
        layergroup.metadata.analyses.push({
            nodes: nodes.reduce(function(nodesIdMap, node) {
                if (node.params.id) {
                    var nodeResource = layergroup.layergroupid + '/analysis/node/' + node.id();
                    var nodeRepr = {
                        status: node.getStatus(),
                        url: this.resourceLocator.getUrls(username, nodeResource)
                    };
                    if (includeQuery) {
                        nodeRepr.query = node.getQuery();
                    }
                    if (node.getStatus() === 'failed') {
                        nodeRepr.error_message = node.getErrorMessage();
                    }
                    nodesIdMap[node.params.id] = nodeRepr;
                }

                return nodesIdMap;
            }.bind(this), {})
        });
    }.bind(this));
};

// TODO this should take into account several URL patterns
MapController.prototype.addDataviewsAndWidgetsUrls = function(username, layergroup, mapConfig) {
    this.addDataviewsUrls(username, layergroup, mapConfig);
    this.addWidgetsUrl(username, layergroup, mapConfig);
};

MapController.prototype.addDataviewsUrls = function(username, layergroup, mapConfig) {
    layergroup.metadata.dataviews = layergroup.metadata.dataviews || {};
    var dataviews = mapConfig.dataviews || {};

    Object.keys(dataviews).forEach(function(dataviewName) {
        var resource = layergroup.layergroupid + '/dataview/' + dataviewName;
        layergroup.metadata.dataviews[dataviewName] = {
            url: this.resourceLocator.getUrls(username, resource)
        };
    }.bind(this));
};

MapController.prototype.addWidgetsUrl = function(username, layergroup, mapConfig) {
    if (layergroup.metadata && Array.isArray(layergroup.metadata.layers) && Array.isArray(mapConfig.layers)) {
        layergroup.metadata.layers = layergroup.metadata.layers.map(function(layer, layerIndex) {
            var mapConfigLayer = mapConfig.layers[layerIndex];
            if (mapConfigLayer.options && mapConfigLayer.options.widgets) {
                layer.widgets = layer.widgets || {};
                Object.keys(mapConfigLayer.options.widgets).forEach(function(widgetName) {
                    var resource = layergroup.layergroupid + '/' + layerIndex + '/widget/' + widgetName;
                    layer.widgets[widgetName] = {
                        type: mapConfigLayer.options.widgets[widgetName].type,
                        url: this.resourceLocator.getUrls(username, resource)
                    };
                }.bind(this));
            }
            return layer;
        }.bind(this));
    }
};
