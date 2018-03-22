const _ = require('underscore');
const windshaft = require('windshaft');
const MapConfig = windshaft.model.MapConfig;
const Datasource = windshaft.model.Datasource;
const ResourceLocator = require('../models/resource-locator');
const cors = require('../middleware/cors');
const user = require('../middleware/user');
const locals = require('../middleware/locals');
const cleanUpQueryParams = require('../middleware/clean-up-query-params');
const layergroupToken = require('../middleware/layergroup-token');
const credentials = require('../middleware/credentials');
const dbConnSetup = require('../middleware/db-conn-setup');
const authorize = require('../middleware/authorize');
const cacheControlHeader = require('../middleware/cache-control-header');
const cacheChannelHeader = require('../middleware/cache-channel-header');
const surrogateKeyHeader = require('../middleware/surrogate-key-header');
const lastModifiedHeader = require('../middleware/last-modified-header');
const sendResponse = require('../middleware/send-response');
const NamedMapMapConfigProvider = require('../models/mapconfig/provider/named-map-provider');
const CreateLayergroupMapConfigProvider = require('../models/mapconfig/provider/create-layergroup-provider');
const LayergroupMetadata = require('../utils/layergroup-metadata');
const rateLimit = require('../middleware/rate-limit');
const { RATE_LIMIT_ENDPOINTS_GROUPS } = rateLimit;

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
function MapController (
    pgConnection,
    templateMaps,
    mapBackend,
    metadataBackend,
    surrogateKeysCache,
    userLimitsApi,
    layergroupAffectedTables,
    mapConfigAdapter,
    statsBackend,
    authApi
) {
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
    const { base_url_mapconfig: mapConfigBasePath, base_url_templated: templateBasePath } = app;

    app.get(
        `${mapConfigBasePath}`,
        this.composeCreateMapMiddleware(RATE_LIMIT_ENDPOINTS_GROUPS.ANONYMOUS)
    );

    app.post(
        `${mapConfigBasePath}`,
        this.composeCreateMapMiddleware(RATE_LIMIT_ENDPOINTS_GROUPS.ANONYMOUS)
    );

    const useTemplate = true;

    app.get(
        `${templateBasePath}/:template_id/jsonp`,
        this.composeCreateMapMiddleware(RATE_LIMIT_ENDPOINTS_GROUPS.NAMED, useTemplate)
    );

    app.post(
        `${templateBasePath}/:template_id`,
        this.composeCreateMapMiddleware(RATE_LIMIT_ENDPOINTS_GROUPS.NAMED, useTemplate)
    );

    app.options(`${mapConfigBasePath}`, cors('Content-Type'));
};

MapController.prototype.composeCreateMapMiddleware = function (endpointGroup, useTemplate = false) {
    const isTemplateInstantiation = useTemplate;
    const useTemplateHash = useTemplate;
    const includeQuery = !useTemplate;
    const label =  useTemplate ? 'NAMED MAP LAYERGROUP' : 'ANONYMOUS LAYERGROUP';
    const addContext = !useTemplate;

    return [
        cors(),
        cleanUpQueryParams(['aggregation']),
        locals(),
        user(),
        rateLimit(this.userLimitsApi, endpointGroup),
        layergroupToken(),
        credentials(),
        authorize(this.authApi),
        dbConnSetup(this.pgConnection),
        initProfiler(isTemplateInstantiation),
        checkJsonContentType(),
        this.getCreateMapMiddlewares(useTemplate),
        incrementMapViewCount(this.metadataBackend),
        augmentLayergroupData(),
        cacheControlHeader({ ttl: global.environment.varnish.layergroupTtl || 86400, revalidate: true }),
        cacheChannelHeader(),
        surrogateKeyHeader({ surrogateKeysCache: this.surrogateKeysCache }),
        lastModifiedHeader({ now: true }),
        setLastUpdatedTimeToLayergroup(),
        setLayerStats(this.pgConnection, this.statsBackend),
        setLayergroupIdHeader(this.templateMaps ,useTemplateHash),
        setDataviewsAndWidgetsUrlsToLayergroupMetadata(this.layergroupMetadata),
        setAnalysesMetadataToLayergroup(this.layergroupMetadata, includeQuery),
        setTurboCartoMetadataToLayergroup(this.layergroupMetadata),
        setAggregationMetadataToLayergroup(this.layergroupMetadata),
        setTilejsonMetadataToLayergroup(this.layergroupMetadata),
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
                this.mapConfigAdapter,
                this.layergroupAffectedTables
            ),
            instantiateLayergroup(
                this.mapBackend,
                this.userLimitsApi,
                this.pgConnection,
                this.layergroupAffectedTables
            )
        ];
    }

    return [
        checkCreateLayergroup(),
        prepareAdapterMapConfig(this.mapConfigAdapter),
        createLayergroup (
            this.mapBackend,
            this.userLimitsApi,
            this.pgConnection,
            this.layergroupAffectedTables
        )
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

function getTemplate (
    templateMaps,
    pgConnection,
    metadataBackend,
    userLimitsApi,
    mapConfigAdapter,
    affectedTablesCache
) {
    return function getTemplateMiddleware (req, res, next) {
        const templateParams = req.body;
        const { user, dbuser, dbname, dbpassword, dbhost, dbport } = res.locals;
        const { template_id } = req.params;
        const { auth_token } = req.query;

        const params = { dbuser, dbname, dbpassword, dbhost, dbport };

        const mapConfigProvider = new NamedMapMapConfigProvider(
            templateMaps,
            pgConnection,
            metadataBackend,
            userLimitsApi,
            mapConfigAdapter,
            affectedTablesCache,
            user,
            template_id,
            templateParams,
            auth_token,
            params
        );

        mapConfigProvider.getMapConfig((err, mapConfig, rendererParams) => {
            req.profiler.done('named.getMapConfig');
            if (err) {
                return next(err);
            }

            res.locals.mapConfig = mapConfig;
            res.locals.rendererParams = rendererParams;
            res.locals.mapConfigProvider = mapConfigProvider;

            next();
        });
    };
}

function prepareAdapterMapConfig (mapConfigAdapter) {
    return function prepareAdapterMapConfigMiddleware(req, res, next) {
        const requestMapConfig = req.body;

        const { user, api_key } = res.locals;
        const { dbuser, dbname, dbpassword, dbhost, dbport } = res.locals;
        const params = Object.assign({ dbuser, dbname, dbpassword, dbhost, dbport }, req.query);

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

        mapConfigAdapter.getMapConfig(user, requestMapConfig, params, context, (err, requestMapConfig) => {
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

function createLayergroup (mapBackend, userLimitsApi, pgConnection, affectedTablesCache) {
    return function createLayergroupMiddleware (req, res, next) {
        const requestMapConfig = req.body;

        const { context } = res.locals;
        const { user, cache_buster, api_key } = res.locals;
        const { dbuser, dbname, dbpassword, dbhost, dbport } = res.locals;

        const params = {
            cache_buster, api_key,
            dbuser, dbname, dbpassword, dbhost, dbport
        };

        const datasource = context.datasource || Datasource.EmptyDatasource();
        const mapConfig = new MapConfig(requestMapConfig, datasource);

        const mapConfigProvider = new CreateLayergroupMapConfigProvider(
            mapConfig,
            user,
            userLimitsApi,
            pgConnection,
            affectedTablesCache,
            params
        );

        const mapParams = { dbuser, dbname, dbpassword, dbhost, dbport };

        mapBackend.createLayergroup(mapConfig, mapParams, mapConfigProvider, (err, layergroup) => {
            req.profiler.done('createLayergroup');
            if (err) {
                return next(err);
            }

            res.body = layergroup;
            res.locals.mapConfig = mapConfig;
            res.locals.mapConfigProvider = mapConfigProvider;
            res.locals.analysesResults = context.analysesResults;

            next();
        });
    };
}

function instantiateLayergroup (mapBackend, userLimitsApi, pgConnection, affectedTablesCache) {
    return function instantiateLayergroupMiddleware (req, res, next) {
        const { user, mapConfig, rendererParams } = res.locals;
        const mapConfigProvider = new CreateLayergroupMapConfigProvider(
            mapConfig,
            user,
            userLimitsApi,
            pgConnection,
            affectedTablesCache,
            rendererParams
        );

        mapBackend.createLayergroup(mapConfig, rendererParams, mapConfigProvider, (err, layergroup) => {
            req.profiler.done('createLayergroup');
            if (err) {
                return next(err);
            }

            res.body = layergroup;

            const { mapConfigProvider } = res.locals;

            res.locals.analysesResults = mapConfigProvider.analysesResults;
            res.locals.template = mapConfigProvider.template;
            res.locals.context = mapConfigProvider.context;

            next();
        });
    };
}

function incrementMapViewCount (metadataBackend) {
    return function incrementMapViewCountMiddleware(req, res, next) {
        const { mapConfig, user } = res.locals;

        // Error won't blow up, just be logged.
        metadataBackend.incMapviewCount(user, mapConfig.obj().stat_tag, (err) => {
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
        const layergroup = res.body;

        // include in layergroup response the variables in serverMedata
        // those variables are useful to send to the client information
        // about how to reach this server or information about it
        _.extend(layergroup, global.environment.serverMetadata);

        next();
    };
}

function setLastUpdatedTimeToLayergroup () {
    return function setLastUpdatedTimeToLayergroupMiddleware (req, res, next) {
        const { mapConfigProvider, analysesResults } = res.locals;
        const layergroup = res.body;

        mapConfigProvider.getAffectedTables((err, affectedTables) => {
            if (err) {
                return next(err);
            }

            if (!affectedTables) {
                return next();
            }

            var lastUpdateTime = affectedTables.getLastUpdatedAt();

            lastUpdateTime = getLastUpdatedTime(analysesResults, lastUpdateTime) || lastUpdateTime;

            // last update for layergroup cache buster
            layergroup.layergroupid = layergroup.layergroupid + ':' + lastUpdateTime;
            layergroup.last_updated = new Date(lastUpdateTime).toISOString();

            next();
        });
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

function setLayerStats (pgConnection, statsBackend) {
    return function setLayerStatsMiddleware(req, res, next) {
        const { user, mapConfig } = res.locals;
        const layergroup = res.body;

        pgConnection.getConnection(user, (err, connection) => {
            if (err) {
                return next(err);
            }

            statsBackend.getStats(mapConfig, connection, function(err, layersStats) {
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
        const { user, template } = res.locals;
        const layergroup = res.body;

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
        const { user, mapConfig } = res.locals;
        const layergroup = res.body;

        layergroupMetadata.addDataviewsAndWidgetsUrls(user, layergroup, mapConfig.obj());

        next();
    };
}

function setAnalysesMetadataToLayergroup (layergroupMetadata, includeQuery) {
    return function setAnalysesMetadataToLayergroupMiddleware (req, res, next) {
        const { user, analysesResults = [] } = res.locals;
        const layergroup = res.body;

        layergroupMetadata.addAnalysesMetadata(user, layergroup, analysesResults, includeQuery);

        next();
    };
}

function setTurboCartoMetadataToLayergroup (layergroupMetadata) {
    return function setTurboCartoMetadataToLayergroupMiddleware (req, res, next) {
        const { mapConfig, context } = res.locals;
        const layergroup = res.body;

        layergroupMetadata.addTurboCartoContextMetadata(layergroup, mapConfig.obj(), context);

        next();
    };
}

function setAggregationMetadataToLayergroup (layergroupMetadata) {
    return function setAggregationMetadataToLayergroupMiddleware (req, res, next) {
        const { mapConfig, context } = res.locals;
        const layergroup = res.body;

        layergroupMetadata.addAggregationContextMetadata(layergroup, mapConfig.obj(), context);

        next();
    };
}

function setTilejsonMetadataToLayergroup (layergroupMetadata) {
    return function augmentLayergroupTilejsonMiddleware (req, res, next) {
        const { user, mapConfig } = res.locals;
        const layergroup = res.body;

        layergroupMetadata.addTileJsonMetadata(layergroup, user, mapConfig);

        next();
    };
}

function augmentError (options) {
    const { addContext = false, label = 'MAPS CONTROLLER' } = options;

    return function augmentErrorMiddleware (err, req, res, next) {
        req.profiler.done('error');
        const { mapConfig } = res.locals;

        if (addContext) {
            err = Number.isFinite(err.layerIndex) ? populateError(err, mapConfig) : err;
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
