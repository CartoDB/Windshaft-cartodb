var _ = require('underscore');
var assert = require('assert');
var step = require('step');
var windshaft = require('windshaft');
var QueryTables = require('cartodb-query-tables');

var ResourceLocator = require('../models/resource-locator');

var cors = require('../middleware/cors');
var userMiddleware = require('../middleware/user');

var MapConfig = windshaft.model.MapConfig;
var Datasource = windshaft.model.Datasource;

var NamedMapsCacheEntry = require('../cache/model/named_maps_entry');

var NamedMapMapConfigProvider = require('../models/mapconfig/provider/named-map-provider');
var CreateLayergroupMapConfigProvider = require('../models/mapconfig/provider/create-layergroup-provider');

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
function MapController(prepareContext, pgConnection, templateMaps, mapBackend, metadataBackend,
                       surrogateKeysCache, userLimitsApi, layergroupAffectedTables, mapConfigAdapter,
                       statsBackend) {
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
    this.prepareContext = prepareContext;
}

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

    this.create(req, res, function createGet$prepareConfig(req, config) {
        if ( ! config ) {
            throw new Error('layergroup GET needs a "config" parameter');
        }
        return JSON.parse(config);
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
            const requestMapConfig = prepareConfigFn(req, res.locals.config);
            return requestMapConfig;
        },
        function prepareAdapterMapConfig(err, requestMapConfig) {
            assert.ifError(err);
            context.analysisConfiguration = {
                user: res.locals.user,
                db: {
                    host: res.locals.dbhost,
                    port: res.locals.dbport,
                    dbname: res.locals.dbname,
                    user: res.locals.dbuser,
                    pass: res.locals.dbpassword
                },
                batch: {
                    username: res.locals.user,
                    apiKey: res.locals.api_key
                }
            };
            self.mapConfigAdapter.getMapConfig(res.locals.user, requestMapConfig, res.locals, context, this);
        },
        function createLayergroup(err, requestMapConfig) {
            assert.ifError(err);
            var datasource = context.datasource || Datasource.EmptyDatasource();
            mapConfig = new MapConfig(requestMapConfig, datasource);
            self.mapBackend.createLayergroup(
                mapConfig,
                res.locals,
                new CreateLayergroupMapConfigProvider(mapConfig, res.locals.user, self.userLimitsApi, res.locals),
                this
            );
        },
        function afterLayergroupCreate(err, layergroup) {
            assert.ifError(err);
            res.locals.mapconfig = mapConfig;
            res.locals.analysesResults = context.analysesResults;
            res.locals.layergroup = layergroup;

            self.afterLayergroupCreate(req, res, this);
        },
        function finish(err) {
            if (err) {
                err = Number.isFinite(err.layerIndex) ? populateError(err, mapConfig) : err;

                err.label = 'ANONYMOUS LAYERGROUP';

                return next(err);
            }

            const { layergroup } = res.locals;

            var analysesResults = context.analysesResults || [];
            self.addDataviewsAndWidgetsUrls(res.locals.user, layergroup, mapConfig.obj());
            self.addAnalysesMetadata(res.locals.user, layergroup, analysesResults, true);
            addContextMetadata(layergroup, mapConfig.obj(), context);
            res.set('X-Layergroup-Id', layergroup.layergroupid);

            res.status(200);

            if (req.query && req.query.callback) {
                res.jsonp(layergroup);
            } else {
                res.json(layergroup);
            }
        }
    );
};

function populateError(err, mapConfig) {
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

    return error;
}

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

    var cdbuser = res.locals.user;

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
                res.locals.auth_token,
                res.locals
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

            res.locals.mapconfig = mapConfig;
            res.locals.analysesResults = mapConfigProvider.analysesResults;
            res.locals.layergroup = layergroup;

            self.afterLayergroupCreate(req, res, this);
        },
        function finishTemplateInstantiation(err) {
            if (err) {
                err.label = 'NAMED MAP LAYERGROUP';
                next(err);
            }

            const { layergroup } = res.locals;

            var templateHash = self.templateMaps.fingerPrint(mapConfigProvider.template).substring(0, 8);
            layergroup.layergroupid = cdbuser + '@' + templateHash + '@' + layergroup.layergroupid;

            var _mapConfig = mapConfig.obj();
            self.addDataviewsAndWidgetsUrls(cdbuser, layergroup, _mapConfig);
            self.addAnalysesMetadata(cdbuser, layergroup, mapConfigProvider.analysesResults);
            addContextMetadata(layergroup, _mapConfig, mapConfigProvider.context);

            res.set('X-Layergroup-Id', layergroup.layergroupid);
            self.surrogateKeysCache.tag(res, new NamedMapsCacheEntry(cdbuser, mapConfigProvider.getTemplateName()));

            res.status(200);

            if (req.query && req.query.callback) {
                res.jsonp(layergroup);
            } else {
                res.json(layergroup);
            }
        }
    );
};

MapController.prototype.afterLayergroupCreate = function (req, res, callback) {
    var self = this;
    const { mapconfig, user } = res.locals;

    var tasksleft = 2; // redis key and affectedTables
    var errors = [];

    var done = function(err) {
        if ( err ) {
            errors.push('' + err);
        }
        if ( ! --tasksleft ) {
            err = errors.length ? new Error(errors.join('\n')) : null;
            callback(err);
        }
    };

    // Don't wait for the mapview count increment to
    // take place before proceeding. Error will be logged
    // asynchronously
    this.metadataBackend.incMapviewCount(user, mapconfig.obj().stat_tag, function(err) {
        req.profiler.done('incMapviewCount');
        if ( err ) {
            global.logger.log("ERROR: failed to increment mapview count for user '" + user + "': " + err);
        }

        done(err);
    });

    step(
        function () {
            self.augmentLayergroupData(req, res, this);
        },
        function getAffectedTables (err) {
            assert.ifError(err);
            self.getAffectedTables(req, res, this);
        },
        function setCacheChannel (err) {
            assert.ifError(err);
            self.setCacheChannel(req, res, this);
        },
        function setLastUpdatedTime (err) {
            assert.ifError(err);
            self.setLastUpdatedTimeToLayergroup(req, res, this);
        },
        function setCacheControl (err) {
            assert.ifError(err);
            self.setCacheControl(req, res, this);
        },
        function setLayerStats (err) {
            assert.ifError(err);
            self.setLayerStats(req, res, this);
        },
        function finish(err) {
            done(err);
        }
    );
};

MapController.prototype.augmentLayergroupData = function (req, res, callback) {
    const { layergroup } = res.locals;

    // include in layergroup response the variables in serverMedata
    // those variables are useful to send to the client information
    // about how to reach this server or information about it
    _.extend(layergroup, global.environment.serverMetadata);

    callback();
}

MapController.prototype.getAffectedTables = function (req, res, callback) {
    const self = this;
    const { dbname, layergroup, user, mapconfig } = res.locals;

    var sql = [];
    mapconfig.getLayers().forEach(function(layer) {
        sql.push(layer.options.sql);
        if (layer.options.affected_tables) {
            layer.options.affected_tables.map(function(table) {
                sql.push('SELECT * FROM ' + table + ' LIMIT 0');
            });
        }
    });

    step(
        function getPgConnection() {
            self.pgConnection.getConnection(user, this);
        },
        function getAffectedTablesAndLastUpdatedTime(err, connection) {
            assert.ifError(err);
            QueryTables.getAffectedTablesFromQuery(connection, sql.join(';'), this);
        },
        function handleAffectedTablesAndLastUpdatedTime(err, affectedTables) {
            if (err) {
                return callback(err);
            }

            // feed affected tables cache so it can be reused from, for instance, layergroup controller
            self.layergroupAffectedTables.set(dbname, layergroup.layergroupId, affectedTables);

            res.locals.affectedTables = affectedTables;

            callback();
        }
    );
};

MapController.prototype.setCacheChannel = function (req, res, callback) {
    const self = this;
    const { affectedTables } = res.locals;

    if (req.method === 'GET') {
        res.set('Last-Modified', (new Date()).toUTCString());
        res.set('X-Cache-Channel', affectedTables.getCacheChannel());
        if (affectedTables.tables && affectedTables.tables.length > 0) {
            self.surrogateKeysCache.tag(res, affectedTables);
        }
    }

    callback();
};

MapController.prototype.setLastUpdatedTimeToLayergroup = function (req, res, callback) {
    const { affectedTables, layergroup, analysesResults } = res.locals;

    var lastUpdateTime = affectedTables.getLastUpdatedAt();

    lastUpdateTime = getLastUpdatedTime(analysesResults, lastUpdateTime) || lastUpdateTime;

    // last update for layergroup cache buster
    layergroup.layergroupid = layergroup.layergroupid + ':' + lastUpdateTime;
    layergroup.last_updated = new Date(lastUpdateTime).toISOString();

    callback();
};

MapController.prototype.setCacheControl = function (req, res, callback) {
    if (req.method === 'GET') {
        var ttl = global.environment.varnish.layergroupTtl || 86400;
        res.set('Cache-Control', 'public,max-age='+ttl+',must-revalidate');
    }

    callback();
};

MapController.prototype.setLayerStats = function (req, res, callback) {
    const { user, mapconfig, layergroup } = res.locals;

    this.pgConnection.getConnection(user, (err, connection) => {
        if (err) {
            return callback(err);
        }

        this.statsBackend.getStats(mapconfig, connection, function(err, layersStats) {
            if (err) {
                return callback(err);
            }

            if (layersStats.length > 0) {
                layergroup.metadata.layers.forEach(function (layer, index) {
                    layer.meta.stats = layersStats[index];
                });
            }

            callback();
        });
    });
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
