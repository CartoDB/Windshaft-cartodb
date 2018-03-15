const _ = require('underscore');
const windshaft = require('windshaft');
const MapConfig = windshaft.model.MapConfig;
const Datasource = windshaft.model.Datasource;
const QueryTables = require('cartodb-query-tables');
const ResourceLocator = require('../models/resource-locator');
const cors = require('../middleware/cors');
const userMiddleware = require('../middleware/user');
const allowQueryParams = require('../middleware/allow-query-params');
const locals = require('../middleware/locals');
const cleanUpQueryParams = require('../middleware/clean-up-query-params');
const layergroupToken = require('../middleware/layergroup-token');
const credentials = require('../middleware/credentials');
const dbConnSetup = require('../middleware/db-conn-setup');
const authorize = require('../middleware/authorize');
const NamedMapsCacheEntry = require('../cache/model/named_maps_entry');
const NamedMapMapConfigProvider = require('../models/mapconfig/provider/named-map-provider');
const CreateLayergroupMapConfigProvider = require('../models/mapconfig/provider/create-layergroup-provider');
const LayergroupMetadata = require('../utils/layergroup-metadata');

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
function MapController(pgConnection, templateMaps, mapBackend, metadataBackend,
                       surrogateKeysCache, userLimitsApi, layergroupAffectedTables, mapConfigAdapter,
                       statsBackend, authApi) {
    this.pgConnection = pgConnection;
    this.templateMaps = templateMaps;
    this.mapBackend = mapBackend;
    this.metadataBackend = metadataBackend;
    this.surrogateKeysCache = surrogateKeysCache;
    this.userLimitsApi = userLimitsApi;
    this.layergroupAffectedTables = layergroupAffectedTables;

    this.mapConfigAdapter = mapConfigAdapter;
    const resourceLocator = new ResourceLocator(global.environment);
    this.layergroupMetadata = new LayergroupMetadata(resourceLocator);

    this.statsBackend = statsBackend;
    this.authApi = authApi;
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
        userMiddleware(),
        allowQueryParams(['aggregation']),
        locals(),
        cleanUpQueryParams(),
        layergroupToken(),
        credentials(),
        authorize(this.authApi),
        dbConnSetup(this.pgConnection),
        initProfiler(isTemplateInstantiation),
        checkJsonContentType(),
        this.getCreateMapMiddlewares(useTemplate),
        incrementMapViewCount(this.metadataBackend),
        augmentLayergroupData(),
        getAffectedTables(this.pgConnection, this.layergroupAffectedTables),
        setCacheChannel(),
        setLastModified(),
        setLastUpdatedTimeToLayergroup(),
        setCacheControl(),
        setLayerStats(this.pgConnection, this.statsBackend),
        setLayergroupIdHeader(this.templateMaps ,useTemplateHash),
        setDataviewsAndWidgetsUrlsToLayergroupMetadata(this.layergroupMetadata),
        setAnalysesMetadataToLayergroup(this.layergroupMetadata, includeQuery),
        setTurboCartoMetadataToLayergroup(this.layergroupMetadata),
        setAggregationMetadataToLayergroup(this.layergroupMetadata),
        setTilejsonMetadataToLayergroup(this.layergroupMetadata),
        setSurrogateKeyHeader(this.surrogateKeysCache),
        sendResponse(),
        augmentError({ label, addContext })
    ];
};

MapController.prototype.getCreateMapMiddlewares = function (useTemplate) {
    if (useTemplate) {
        return [
            checkInstantiteLayergroup(),
            getTemplate(
                this.templateMaps,
                this.pgConnection,
                this.metadataBackend,
                this.userLimitsApi,
                this.mapConfigAdapter
            ),
            instantiateLayergroup(this.mapBackend, this.userLimitsApi)
        ];
    }

    return [
        checkCreateLayergroup(),
        prepareAdapterMapConfig(this.mapConfigAdapter),
        createLayergroup (this.mapBackend, this.userLimitsApi)
    ];
};

function initProfiler (isTemplateInstantiation) {
    const operation = isTemplateInstantiation ? 'instance_template' : 'createmap';

    return function initProfilerMiddleware (req, res, next) {
        req.profiler.start(`windshaft-cartodb.${operation}_${req.method.toLowerCase()}`);
        req.profiler.done(`${operation}.initProfilerMiddleware`);
        next();
    };
}

function checkJsonContentType () {
    return function checkJsonContentTypeMiddleware(req, res, next) {
        if (req.method === 'POST' && !req.is('application/json')) {
            return next(new Error('POST data must be of type application/json'));
        }

        req.profiler.done('checkJsonContentTypeMiddleware');

        next();
    };
}

function checkInstantiteLayergroup () {
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

        req.profiler.done('checkInstantiteLayergroup');

        return next();
    };
}

function checkCreateLayergroup () {
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

        req.profiler.done('checkCreateLayergroup');
        return next();
    };
}

function getTemplate (templateMaps, pgConnection, metadataBackend, userLimitsApi, mapConfigAdapter) {
    return function getTemplateMiddleware (req, res, next) {
        const templateParams = req.body;
        const { user } = res.locals;

        const mapconfigProvider = new NamedMapMapConfigProvider(
            templateMaps,
            pgConnection,
            metadataBackend,
            userLimitsApi,
            mapConfigAdapter,
            user,
            req.params.template_id,
            templateParams,
            res.locals.auth_token,
            res.locals
        );

        mapconfigProvider.getMapConfig((err, mapconfig, rendererParams) => {
            req.profiler.done('named.getMapConfig');
            if (err) {
                return next(err);
            }

            res.locals.mapconfig = mapconfig;
            res.locals.rendererParams = rendererParams;
            res.locals.mapconfigProvider = mapconfigProvider;

            next();
        });
    };
}

function prepareAdapterMapConfig (mapConfigAdapter) {
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

        mapConfigAdapter.getMapConfig(user, requestMapConfig, res.locals, context, (err, requestMapConfig) => {
            req.profiler.done('anonymous.getMapConfig');
            if (err) {
                return next(err);
            }

            req.body = requestMapConfig;
            res.locals.context = context;

            next();
        });
    };
}

function createLayergroup (mapBackend, userLimitsApi) {
    return function createLayergroupMiddleware (req, res, next) {
        const requestMapConfig = req.body;
        const { context, user } = res.locals;
        const datasource = context.datasource || Datasource.EmptyDatasource();
        const mapconfig = new MapConfig(requestMapConfig, datasource);
        const mapconfigProvider =
            new CreateLayergroupMapConfigProvider(mapconfig, user, userLimitsApi, res.locals);

        res.locals.mapconfig = mapconfig;
        res.locals.analysesResults = context.analysesResults;

        mapBackend.createLayergroup(mapconfig, res.locals, mapconfigProvider, (err, layergroup) => {
            req.profiler.done('createLayergroup');
            if (err) {
                return next(err);
            }

            res.locals.layergroup = layergroup;

            next();
        });
    };
}

function instantiateLayergroup (mapBackend, userLimitsApi) {
    return function instantiateLayergroupMiddleware (req, res, next) {
        const { user, mapconfig, rendererParams } = res.locals;
        const mapconfigProvider =
            new CreateLayergroupMapConfigProvider(mapconfig, user, userLimitsApi, rendererParams);

        mapBackend.createLayergroup(mapconfig, rendererParams, mapconfigProvider, (err, layergroup) => {
            req.profiler.done('createLayergroup');
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
    };
}

function incrementMapViewCount (metadataBackend) {
    return function incrementMapViewCountMiddleware(req, res, next) {
        const { mapconfig, user } = res.locals;

        // Error won't blow up, just be logged.
        metadataBackend.incMapviewCount(user, mapconfig.obj().stat_tag, (err) => {
            req.profiler.done('incMapviewCount');

            if (err) {
                global.logger.log(`ERROR: failed to increment mapview count for user '${user}': ${err.message}`);
            }

            next();
        });
    };
}

function augmentLayergroupData () {
    return function augmentLayergroupDataMiddleware (req, res, next) {
        const { layergroup } = res.locals;

        // include in layergroup response the variables in serverMedata
        // those variables are useful to send to the client information
        // about how to reach this server or information about it
        _.extend(layergroup, global.environment.serverMetadata);

        next();
    };
}

function getAffectedTables (pgConnection, layergroupAffectedTables) {
    return function getAffectedTablesMiddleware (req, res, next) {
        const { dbname, layergroup, user, mapconfig } = res.locals;

        pgConnection.getConnection(user, (err, connection) => {
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
                req.profiler.done('getAffectedTablesFromQuery');
                if (err) {
                    return next(err);
                }

                // feed affected tables cache so it can be reused from, for instance, layergroup controller
                layergroupAffectedTables.set(dbname, layergroup.layergroupId, affectedTables);

                res.locals.affectedTables = affectedTables;

                next();
            });
        });
    };
}

function setCacheChannel () {
    return function setCacheChannelMiddleware (req, res, next) {
        const { affectedTables } = res.locals;

        if (req.method === 'GET') {
            res.set('X-Cache-Channel', affectedTables.getCacheChannel());
        }

        next();
    };
}

function setLastModified () {
    return function setLastModifiedMiddleware (req, res, next) {
        if (req.method === 'GET') {
            res.set('Last-Modified', (new Date()).toUTCString());
        }

        next();
    };
}

function setLastUpdatedTimeToLayergroup () {
    return function setLastUpdatedTimeToLayergroupMiddleware (req, res, next) {
        const { affectedTables, layergroup, analysesResults } = res.locals;

        var lastUpdateTime = affectedTables.getLastUpdatedAt();

        lastUpdateTime = getLastUpdatedTime(analysesResults, lastUpdateTime) || lastUpdateTime;

        // last update for layergroup cache buster
        layergroup.layergroupid = layergroup.layergroupid + ':' + lastUpdateTime;
        layergroup.last_updated = new Date(lastUpdateTime).toISOString();

        next();
    };
}

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

function setCacheControl () {
    return function setCacheControlMiddleware (req, res, next) {
        if (req.method === 'GET') {
            var ttl = global.environment.varnish.layergroupTtl || 86400;
            res.set('Cache-Control', 'public,max-age='+ttl+',must-revalidate');
        }

        next();
    };
}

function setLayerStats (pgConnection, statsBackend) {
    return function setLayerStatsMiddleware(req, res, next) {
        const { user, mapconfig, layergroup } = res.locals;

        pgConnection.getConnection(user, (err, connection) => {
            if (err) {
                return next(err);
            }

            statsBackend.getStats(mapconfig, connection, function(err, layersStats) {
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
    };
}

function setLayergroupIdHeader (templateMaps, useTemplateHash) {
    return function setLayergroupIdHeaderMiddleware (req, res, next) {
        const { layergroup, user, template } = res.locals;

        if (useTemplateHash) {
            var templateHash = templateMaps.fingerPrint(template).substring(0, 8);
            layergroup.layergroupid = `${user}@${templateHash}@${layergroup.layergroupid}`;
        }

        res.set('X-Layergroup-Id', layergroup.layergroupid);

        next();
    };
}

function setDataviewsAndWidgetsUrlsToLayergroupMetadata (layergroupMetadata) {
    return function setDataviewsAndWidgetsUrlsToLayergroupMetadataMiddleware (req, res, next) {
        const { layergroup, user, mapconfig } = res.locals;

        layergroupMetadata.addDataviewsAndWidgetsUrls(user, layergroup, mapconfig.obj());

        next();
    };
}

function setAnalysesMetadataToLayergroup (layergroupMetadata, includeQuery) {
    return function setAnalysesMetadataToLayergroupMiddleware (req, res, next) {
        const { layergroup, user, analysesResults = [] } = res.locals;

        layergroupMetadata.addAnalysesMetadata(user, layergroup, analysesResults, includeQuery);

        next();
    };
}

function setTurboCartoMetadataToLayergroup (layergroupMetadata) {
    return function setTurboCartoMetadataToLayergroupMiddleware (req, res, next) {
        const { layergroup, mapconfig, context } = res.locals;

        layergroupMetadata.addTurboCartoContextMetadata(layergroup, mapconfig.obj(), context);

        next();
    };
}

function setAggregationMetadataToLayergroup (layergroupMetadata) {
    return function setAggregationMetadataToLayergroupMiddleware (req, res, next) {
        const { layergroup, mapconfig, context } = res.locals;

        layergroupMetadata.addAggregationContextMetadata(layergroup, mapconfig.obj(), context);

        next();
    };
}

function setTilejsonMetadataToLayergroup (layergroupMetadata) {
    return function augmentLayergroupTilejsonMiddleware (req, res, next) {
        const { layergroup, user, mapconfig } = res.locals;

        layergroupMetadata.addTileJsonMetadata(layergroup, user, mapconfig);

        next();
    };
}

function setSurrogateKeyHeader (surrogateKeysCache) {
    return function setSurrogateKeyHeaderMiddleware(req, res, next) {
        const { affectedTables, user, templateName } = res.locals;

        if (req.method === 'GET' && affectedTables.tables && affectedTables.tables.length > 0) {
            surrogateKeysCache.tag(res, affectedTables);
        }

        if (templateName) {
            surrogateKeysCache.tag(res, new NamedMapsCacheEntry(user, templateName));
        }

        next();
    };
}

function sendResponse () {
    return function sendResponseMiddleware (req, res) {
        req.profiler.done('res');
        const { layergroup } = res.locals;

        res.status(200);

        if (req.query && req.query.callback) {
            res.jsonp(layergroup);
        } else {
            res.json(layergroup);
        }
    };
}

function augmentError (options) {
    const { addContext = false, label = 'MAPS CONTROLLER' } = options;

    return function augmentErrorMiddleware (err, req, res, next) {
        req.profiler.done('error');
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
