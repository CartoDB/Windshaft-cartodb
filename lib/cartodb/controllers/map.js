var _ = require('underscore');
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
    app.get(app.base_url_mapconfig, this.composeCreateMapMiddleware());

    app.post(app.base_url_mapconfig, this.composeCreateMapMiddleware());

    app.get(app.base_url_templated + '/:template_id/jsonp', this.composeCreateMapMiddleware({
        useTemplate: true
    }));

    app.post(app.base_url_templated + '/:template_id', this.composeCreateMapMiddleware({
        useTemplate: true
    }));

    app.options(app.base_url_mapconfig, cors('Content-Type'));
};

MapController.prototype.composeCreateMapMiddleware = function ({ useTemplate = false } = {}) {
    const useTemplateHash = useTemplate;
    const includeQuery = !useTemplate;
    const label =  useTemplate ? 'NAMED MAP LAYERGROUP' : 'ANONYMOUS LAYERGROUP';
    const addContext = !useTemplate;

    return [
        cors(),
        userMiddleware,
        this.prepareContext,
        useTemplate ? checkIntantiteLayergroup : checkCreateLayergroup,
        useTemplate ? this.getTemplate.bind(this) : this.prepareAdapterMapConfig.bind(this),
        useTemplate ? this.instantiateLayergroup.bind(this) : this.createLayergroup.bind(this),
        this.incrementMapViewCount.bind(this),
        this.augmentLayergroupData.bind(this),
        this.getAffectedTables.bind(this),
        this.setCacheChannel.bind(this),
        this.setLastUpdatedTimeToLayergroup.bind(this),
        this.setCacheControl.bind(this),
        this.setLayerStats.bind(this),
        this.setLayergroupIdHeaderBuilder(useTemplateHash),
        this.setDataviewsAndWidgetsUrlsToLayergroupMetadata.bind(this),
        this.setAnalysesMetadataToLayergroupBuilder(includeQuery),
        this.setTurboCartoMetadataToLayergroup.bind(this),
        this.setSurrogateKeyHeader.bind(this),
        sendResponse,
        augmentError({ label, addContext })
    ];
};

function checkCreateLayergroup (req, res, next) {
    req.profiler.start(`windshaft.createmap_${req.method.toLowerCase()}`);

    if (req.method === 'POST' && !req.is('application/json')) {
        return next(new Error('layergroup POST data must be of type application/json'));
    }

    if (req.method === 'GET') {
        const { config } = res.locals;

        if (!config) {
            return next(new Error('layergroup GET needs a "config" parameter'));
        }

        try {
            req.body = JSON.parse(config);
        } catch (err) {
            return next(err);
        }
    }

    return next();
}

function checkIntantiteLayergroup(req, res, next) {
    // jshint maxcomplexity: 7
    req.profiler.start(`windshaft-cartodb.instance_template_${req.method.toLowerCase()}`);

    if (req.method === 'POST' && !req.is('application/json')) {
        return next(new Error('Template POST data must be of type application/json'));
    }

    if (req.method === 'GET') {
        const { callback, config } = req.query;

        if (callback === undefined || callback.length === 0) {
            return next(new Error('callback parameter should be present and be a function name'));
        }

        if (config) {
            try {
                req.body = JSON.parse(config);
            } catch(e) {
                return next(new Error('Invalid config parameter, should be a valid JSON'));
            }
        }
    }

    return next();
}

MapController.prototype.prepareAdapterMapConfig = function (req, res, next) {
    const requestMapConfig = req.body;
    const { user, dbhost, dbport, dbname, dbuser, dbpassword, api_key } = res.locals;

    const context = {
        analysisConfiguration: {
            user,
            db: {
                host: dbhost,
                port: dbport,
                dbname: dbname,
                user: dbuser,
                pass: dbpassword
            },
            batch: {
                username: user,
                apiKey: api_key
            }
        }
    };

    this.mapConfigAdapter.getMapConfig(user, requestMapConfig, res.locals, context, (err, requestMapConfig) => {
        if (err) {
            return next(err);
        }

        req.body = requestMapConfig;
        res.locals.context = context;

        next();
    });
};

MapController.prototype.createLayergroup = function(req, res, next) {
    const requestMapConfig = req.body;
    const { context, user } = res.locals;
    const datasource = context.datasource || Datasource.EmptyDatasource();
    const mapconfig = new MapConfig(requestMapConfig, datasource);
    const mapconfigProvider = new CreateLayergroupMapConfigProvider(mapconfig, user, this.userLimitsApi, res.locals);

    res.locals.mapconfig = mapconfig;
    res.locals.analysesResults = context.analysesResults;

    this.mapBackend.createLayergroup(mapconfig, res.locals, mapconfigProvider, (err, layergroup) => {
        if (err) {
            return next(err);
        }

        res.locals.layergroup = layergroup;

        next();
    });
};

MapController.prototype.getTemplate = function(req, res, next) {
    const templateParams = req.body;
    const { user } = res.locals;

    const mapconfigProvider = new NamedMapMapConfigProvider(
        this.templateMaps,
        this.pgConnection,
        this.metadataBackend,
        this.userLimitsApi,
        this.mapConfigAdapter,
        user,
        req.params.template_id,
        templateParams,
        res.locals.auth_token,
        res.locals
    );

    mapconfigProvider.getMapConfig((err, mapconfig, rendererParams) => {
        if (err) {
            return next(err);
        }

        res.locals.mapconfig = mapconfig;
        res.locals.rendererParams = rendererParams;
        res.locals.mapconfigProvider = mapconfigProvider;

        next();
    });
};

MapController.prototype.instantiateLayergroup = function(req, res, next) {
    const { user, mapconfig, rendererParams } = res.locals;
    const mapconfigProvider =
        new CreateLayergroupMapConfigProvider(mapconfig, user, this.userLimitsApi, rendererParams);

    this.mapBackend.createLayergroup(mapconfig, rendererParams, mapconfigProvider, (err, layergroup) => {
        if (err) {
            return next(err);
        }

        res.locals.layergroup = layergroup;

        // TODO: Do not provide shortcuts
        const { mapconfigProvider } = res.locals;

        res.locals.analysesResults = mapconfigProvider.analysesResults;
        res.locals.template = mapconfigProvider.template;
        res.locals.templateName = mapconfigProvider.getTemplateName();
        res.locals.context = mapconfigProvider.context;

        next();
    });
};

function sendResponse (req, res) {
    const { layergroup } = res.locals;

    res.status(200);

    if (req.query && req.query.callback) {
        res.jsonp(layergroup);
    } else {
        res.json(layergroup);
    }
}

MapController.prototype.afterLayergroupCreateBuilder = function (options = {}) {
    const {
        useTemplateHash = false,
        includeQuery = false
    } = options;

    return [
        this.incrementMapViewCount.bind(this),
        this.augmentLayergroupData.bind(this),
        this.getAffectedTables.bind(this),
        this.setCacheChannel.bind(this),
        this.setLastUpdatedTimeToLayergroup.bind(this),
        this.setCacheControl.bind(this),
        this.setLayerStats.bind(this),
        this.setLayergroupIdHeaderBuilder(useTemplateHash),
        this.setDataviewsAndWidgetsUrlsToLayergroupMetadata.bind(this),
        this.setAnalysesMetadataToLayergroupBuilder(includeQuery),
        this.setTurboCartoMetadataToLayergroup.bind(this),
        this.setSurrogateKeyHeader.bind(this)
    ];
};

MapController.prototype.incrementMapViewCount = function (req, res, callback) {
    const { mapconfig, user } = res.locals;

    // Error won't blow up, just be logged.
    this.metadataBackend.incMapviewCount(user, mapconfig.obj().stat_tag, (err) => {
        req.profiler.done('incMapviewCount');

        if (err) {
            global.logger.log(`ERROR: failed to increment mapview count for user '${user}': ${err.message}`);
        }

        callback();
    });
};

MapController.prototype.augmentLayergroupData = function (req, res, callback) {
    const { layergroup } = res.locals;

    // include in layergroup response the variables in serverMedata
    // those variables are useful to send to the client information
    // about how to reach this server or information about it
    _.extend(layergroup, global.environment.serverMetadata);

    callback();
};

MapController.prototype.getAffectedTables = function (req, res, next) {
    const { dbname, layergroup, user, mapconfig } = res.locals;

    this.pgConnection.getConnection(user, (err, connection) => {
        if (err) {
            return next(err);
        }

        const sql = [];
        mapconfig.getLayers().forEach(function(layer) {
            sql.push(layer.options.sql);
            if (layer.options.affected_tables) {
                layer.options.affected_tables.map(function(table) {
                    sql.push('SELECT * FROM ' + table + ' LIMIT 0');
                });
            }
        });

        QueryTables.getAffectedTablesFromQuery(connection, sql.join(';'), (err, affectedTables) => {
            if (err) {
                return next(err);
            }

            // feed affected tables cache so it can be reused from, for instance, layergroup controller
            this.layergroupAffectedTables.set(dbname, layergroup.layergroupId, affectedTables);

            res.locals.affectedTables = affectedTables;

            next();
        });
    });
};

MapController.prototype.setCacheChannel = function (req, res, callback) {
    const { affectedTables } = res.locals;

    if (req.method === 'GET') {
        res.set('Last-Modified', (new Date()).toUTCString());
        res.set('X-Cache-Channel', affectedTables.getCacheChannel());
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

MapController.prototype.setLayergroupIdHeaderBuilder = function (useTemplateHash) {
    const self = this;
    return function setLayergroupIdHeader(req, res, callback) {
        const { layergroup, user, template } = res.locals;

        if (useTemplateHash) {
            var templateHash = self.templateMaps.fingerPrint(template).substring(0, 8);
            layergroup.layergroupid = `${user}@${templateHash}@${layergroup.layergroupid}`;
        }

        res.set('X-Layergroup-Id', layergroup.layergroupid);

        callback();
    };
};

MapController.prototype.setDataviewsAndWidgetsUrlsToLayergroupMetadata = function (req, res, callback) {
    const { layergroup, user, mapconfig } = res.locals;

    this.addDataviewsAndWidgetsUrls(user, layergroup, mapconfig.obj());

    callback();
};

MapController.prototype.setAnalysesMetadataToLayergroupBuilder = function (includeQuery) {
    const self = this;

    return function setAnalysesMetadataToLayergroup (req, res, callback) {
        const { layergroup, user, analysesResults = [] } = res.locals;

        self.addAnalysesMetadata(user, layergroup, analysesResults, includeQuery);

        callback();
    };
};

MapController.prototype.setTurboCartoMetadataToLayergroup = function (req, res, callback) {
    const { layergroup, mapconfig, context } = res.locals;

    addContextMetadata(layergroup, mapconfig.obj(), context);

    callback();
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

MapController.prototype.setSurrogateKeyHeader = function (req, res, callback) {
    const { affectedTables, user, templateName } = res.locals;

    if (req.method === 'GET' && affectedTables.tables && affectedTables.tables.length > 0) {
        this.surrogateKeysCache.tag(res, affectedTables);
    }

    if (templateName) {
        this.surrogateKeysCache.tag(res, new NamedMapsCacheEntry(user, templateName));
    }

    callback();
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

function augmentError (options) {
    const { addContext = false, label = 'MAPS CONTROLLER' } = options;

    return function mapError (err, req, res, next) {
        const { mapconfig } = res.locals;

        if (addContext) {
            err = Number.isFinite(err.layerIndex) ? populateError(err, mapconfig) : err;
        }

        err.label = label;

        next(err);
    };
}

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
