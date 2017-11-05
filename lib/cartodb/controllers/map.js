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
    const { base_url_mapconfig, base_url_templated } = app;
    const useTemplate = true;

    app.get(base_url_mapconfig, this.composeCreateMapMiddleware());
    app.post(base_url_mapconfig, this.composeCreateMapMiddleware());
    app.get(`${base_url_templated}/:template_id/jsonp`, this.composeCreateMapMiddleware(useTemplate));
    app.post(`${base_url_templated}/:template_id`, this.composeCreateMapMiddleware(useTemplate));
    app.options(app.base_url_mapconfig, cors('Content-Type'));
};

MapController.prototype.composeCreateMapMiddleware = function (useTemplate = false) {
    const isTemplateInstantiation = useTemplate;
    const useTemplateHash = useTemplate;
    const includeQuery = !useTemplate;
    const label =  useTemplate ? 'NAMED MAP LAYERGROUP' : 'ANONYMOUS LAYERGROUP';
    const addContext = !useTemplate;

    return [
        cors(),
        userMiddleware,
        this.prepareContext,
        this.initProfiler(isTemplateInstantiation),
        this.checkJsonContentType(),
        useTemplate ? this.checkInstantiteLayergroup() : this.checkCreateLayergroup(),
        useTemplate ? this.getTemplate() : this.prepareAdapterMapConfig(),
        useTemplate ? this.instantiateLayergroup() : this.createLayergroup(),
        this.incrementMapViewCount(),
        this.augmentLayergroupData(),
        this.getAffectedTables(),
        this.setCacheChannel(),
        this.setLastUpdatedTimeToLayergroup(),
        this.setCacheControl(),
        this.setLayerStats(),
        this.setLayergroupIdHeader(useTemplateHash),
        this.setDataviewsAndWidgetsUrlsToLayergroupMetadata(),
        this.setAnalysesMetadataToLayergroup(includeQuery),
        this.setTurboCartoMetadataToLayergroup(),
        this.setSurrogateKeyHeader(),
        this.sendResponse(),
        this.augmentError({ label, addContext })
    ];
};

MapController.prototype.initProfiler = function (isTemplateInstantiation) {
    const operation = isTemplateInstantiation ? 'instance_template' : 'createmap';

    return function initProfilerMiddleware (req, res, next) {
        req.profiler.start(`windshaft-cartodb.${operation}_${req.method.toLowerCase()}`);
        next();
    };
};

MapController.prototype.checkJsonContentType = function () {
    return function checkJsonContentTypeMiddleware(req, res, next) {
        if (req.method === 'POST' && !req.is('application/json')) {
            return next(new Error('POST data must be of type application/json'));
        }

        next();
    };
};

MapController.prototype.checkInstantiteLayergroup = function () {
    return function checkInstantiteLayergroupMiddleware(req, res, next) {
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
    };
};

MapController.prototype.checkCreateLayergroup = function () {
    return function checkCreateLayergroupMiddleware (req, res, next) {
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
    };
};

MapController.prototype.getTemplate = function () {
    return function getTemplateMiddleware (req, res, next) {
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
    }.bind(this);
};

MapController.prototype.prepareAdapterMapConfig = function () {
    return function prepareAdapterMapConfigMiddleware(req, res, next) {
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
    }.bind(this);
};

MapController.prototype.createLayergroup = function () {
    return function createLayergroupMiddleware (req, res, next) {
        const requestMapConfig = req.body;
        const { context, user } = res.locals;
        const datasource = context.datasource || Datasource.EmptyDatasource();
        const mapconfig = new MapConfig(requestMapConfig, datasource);
        const mapconfigProvider =
            new CreateLayergroupMapConfigProvider(mapconfig, user, this.userLimitsApi, res.locals);

        res.locals.mapconfig = mapconfig;
        res.locals.analysesResults = context.analysesResults;

        this.mapBackend.createLayergroup(mapconfig, res.locals, mapconfigProvider, (err, layergroup) => {
            if (err) {
                return next(err);
            }

            res.locals.layergroup = layergroup;

            next();
        });
    }.bind(this);
};

MapController.prototype.instantiateLayergroup = function () {
    return function instantiateLayergroupMiddleware (req, res, next) {
        const { user, mapconfig, rendererParams } = res.locals;
        const mapconfigProvider =
            new CreateLayergroupMapConfigProvider(mapconfig, user, this.userLimitsApi, rendererParams);

        this.mapBackend.createLayergroup(mapconfig, rendererParams, mapconfigProvider, (err, layergroup) => {
            if (err) {
                return next(err);
            }

            res.locals.layergroup = layergroup;

            const { mapconfigProvider } = res.locals;

            res.locals.analysesResults = mapconfigProvider.analysesResults;
            res.locals.template = mapconfigProvider.template;
            res.locals.templateName = mapconfigProvider.getTemplateName();
            res.locals.context = mapconfigProvider.context;

            next();
        });
    }.bind(this);
};

MapController.prototype.incrementMapViewCount = function () {
    return function incrementMapViewCountMiddleware(req, res, next) {
        const { mapconfig, user } = res.locals;

        // Error won't blow up, just be logged.
        this.metadataBackend.incMapviewCount(user, mapconfig.obj().stat_tag, (err) => {
            req.profiler.done('incMapviewCount');

            if (err) {
                global.logger.log(`ERROR: failed to increment mapview count for user '${user}': ${err.message}`);
            }

            next();
        });
    }.bind(this);
};

MapController.prototype.augmentLayergroupData = function () {
    return function augmentLayergroupDataMiddleware (req, res, next) {
        const { layergroup } = res.locals;

        // include in layergroup response the variables in serverMedata
        // those variables are useful to send to the client information
        // about how to reach this server or information about it
        _.extend(layergroup, global.environment.serverMetadata);

        next();
    };
};

MapController.prototype.getAffectedTables = function () {
    return function getAffectedTablesMiddleware (req, res, next) {
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
    }.bind(this);
};

MapController.prototype.setCacheChannel = function () {
    return function setCacheChannelMiddleware (req, res, next) {
        const { affectedTables } = res.locals;

        if (req.method === 'GET') {
            res.set('Last-Modified', (new Date()).toUTCString());
            res.set('X-Cache-Channel', affectedTables.getCacheChannel());
        }

        next();
    };
};

MapController.prototype.setLastUpdatedTimeToLayergroup = function () {
    return function setLastUpdatedTimeToLayergroupMiddleware (req, res, next) {
        const { affectedTables, layergroup, analysesResults } = res.locals;

        var lastUpdateTime = affectedTables.getLastUpdatedAt();

        lastUpdateTime = getLastUpdatedTime(analysesResults, lastUpdateTime) || lastUpdateTime;

        // last update for layergroup cache buster
        layergroup.layergroupid = layergroup.layergroupid + ':' + lastUpdateTime;
        layergroup.last_updated = new Date(lastUpdateTime).toISOString();

        next();
    };
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

MapController.prototype.setCacheControl = function () {
    return function setCacheControlMiddleware (req, res, next) {
        if (req.method === 'GET') {
            var ttl = global.environment.varnish.layergroupTtl || 86400;
            res.set('Cache-Control', 'public,max-age='+ttl+',must-revalidate');
        }

        next();
    };
};

MapController.prototype.setLayerStats = function () {
    return function setLayerStatsMiddleware(req, res, next) {
        const { user, mapconfig, layergroup } = res.locals;

        this.pgConnection.getConnection(user, (err, connection) => {
            if (err) {
                return next(err);
            }

            this.statsBackend.getStats(mapconfig, connection, function(err, layersStats) {
                if (err) {
                    return next(err);
                }

                if (layersStats.length > 0) {
                    layergroup.metadata.layers.forEach(function (layer, index) {
                        layer.meta.stats = layersStats[index];
                    });
                }

                next();
            });
        });
    }.bind(this);
};

MapController.prototype.setLayergroupIdHeader = function (useTemplateHash) {
    return function setLayergroupIdHeaderMiddleware (req, res, next) {
        const { layergroup, user, template } = res.locals;

        if (useTemplateHash) {
            var templateHash = this.templateMaps.fingerPrint(template).substring(0, 8);
            layergroup.layergroupid = `${user}@${templateHash}@${layergroup.layergroupid}`;
        }

        res.set('X-Layergroup-Id', layergroup.layergroupid);

        next();
    }.bind(this);
};

MapController.prototype.setDataviewsAndWidgetsUrlsToLayergroupMetadata = function () {
    return function setDataviewsAndWidgetsUrlsToLayergroupMetadataMiddleware (req, res, next) {
        const { layergroup, user, mapconfig } = res.locals;

        this.addDataviewsAndWidgetsUrls(user, layergroup, mapconfig.obj());

        next();
    }.bind(this);
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

MapController.prototype.setAnalysesMetadataToLayergroup = function (includeQuery) {
    return function setAnalysesMetadataToLayergroupMiddleware (req, res, next) {
        const { layergroup, user, analysesResults = [] } = res.locals;

        this.addAnalysesMetadata(user, layergroup, analysesResults, includeQuery);

        next();
    }.bind(this);
};

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

MapController.prototype.setTurboCartoMetadataToLayergroup = function () {
    return function setTurboCartoMetadataToLayergroupMiddleware (req, res, next) {
        const { layergroup, mapconfig, context } = res.locals;

        addContextMetadata(layergroup, mapconfig.obj(), context);

        next();
    };
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

MapController.prototype.setSurrogateKeyHeader = function () {
    return function setSurrogateKeyHeaderMiddleware(req, res, next) {
        const { affectedTables, user, templateName } = res.locals;

        if (req.method === 'GET' && affectedTables.tables && affectedTables.tables.length > 0) {
            this.surrogateKeysCache.tag(res, affectedTables);
        }

        if (templateName) {
            this.surrogateKeysCache.tag(res, new NamedMapsCacheEntry(user, templateName));
        }

        next();
    }.bind(this);
};

MapController.prototype.sendResponse = function () {
    return function sendResponseMiddleware (req, res) {
        const { layergroup } = res.locals;

        res.status(200);

        if (req.query && req.query.callback) {
            res.jsonp(layergroup);
        } else {
            res.json(layergroup);
        }
    };
};

MapController.prototype.augmentError = function (options) {
    const { addContext = false, label = 'MAPS CONTROLLER' } = options;

    return function augmentErrorMiddleware (err, req, res, next) {
        const { mapconfig } = res.locals;

        if (addContext) {
            err = Number.isFinite(err.layerIndex) ? populateError(err, mapconfig) : err;
        }

        err.label = label;

        next(err);
    };
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
