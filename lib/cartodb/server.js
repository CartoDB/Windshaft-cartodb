var assert = require('assert');

var express = require('express');
var RedisPool = require('redis-mpool');
var cartodbRedis = require('cartodb-redis');
var _ = require('underscore');
var step = require('step');


var HealthCheck = require('./monitoring/health_check');
var StaticMapsController = require('./controllers/static_maps');
var MapController = require('./controllers/map');

var SurrogateKeysCache = require('./cache/surrogate_keys_cache');
var NamedMapsCacheEntry = require('./cache/model/named_maps_entry');
var VarnishHttpCacheBackend = require('./cache/backend/varnish_http');
var FastlyCacheBackend = require('./cache/backend/fastly');

var MapConfigNamedLayersAdapter = require('./models/mapconfig_named_layers_adapter');


var windshaft = require('windshaft');
var grainstore = windshaft.grainstore;
var mapnik = windshaft.mapnik;

var TemplateMaps = require('./backends/template_maps.js');
var QueryTablesApi = require('./api/query_tables_api');
var PgQueryRunner = require('./backends/pg_query_runner');
var PgConnection = require('./backends/pg_connection');

var CdbRequest = require('./models/cdb_request');
var cdbRequest = new CdbRequest();

var LZMA = require('lzma').LZMA;
// Whitelist query parameters and attach format
var REQUEST_QUERY_PARAMS_WHITELIST = [
    'config',
    'map_key',
    'api_key',
    'auth_token',
    'callback'
];

var lzmaWorker = new LZMA();


var WELCOME_MSG = "This is the CartoDB Maps API, " +
    "see the documentation at http://docs.cartodb.com/cartodb-platform/maps-api.html";


var timeoutErrorTilePath = __dirname + '/../../assets/render-timeout-fallback.png';
var timeoutErrorTile = require('fs').readFileSync(timeoutErrorTilePath, {encoding: null});



module.exports = function(serverOptions) {
    // Make stats client globally accessible
    global.statsClient = windshaft.stats.Client.getInstance(serverOptions.statsd);

    var redisPool = new RedisPool(_.defaults(global.environment.redis, {
        name: 'windshaft:server',
        unwatchOnRelease: false,
        noReadyCheck: true
    }));

    redisPool.on('status', function(status) {
        var keyPrefix = 'windshaft.redis-pool.' + status.name + '.db' + status.db + '.';
        global.statsClient.gauge(keyPrefix + 'count', status.count);
        global.statsClient.gauge(keyPrefix + 'unused', status.unused);
        global.statsClient.gauge(keyPrefix + 'waiting', status.waiting);
    });

    var metadataBackend = cartodbRedis({pool: redisPool});
    var pgConnection = new PgConnection(metadataBackend);
    var pgQueryRunner = new PgQueryRunner(pgConnection);
    var queryTablesApi = new QueryTablesApi(pgQueryRunner);

    var templateMaps = new TemplateMaps(redisPool, {
        max_user_templates: global.environment.maxUserTemplates
    });

    // This is for Templated maps
    //
    // "named" is the official, "template" is for backward compatibility up to 1.6.x
    //
    var template_baseurl = global.environment.base_url_templated || '(?:/maps/named|/tiles/template)';

    var surrogateKeysCacheBackends = [];

    if (serverOptions.varnish_purge_enabled) {
        surrogateKeysCacheBackends.push(
            new VarnishHttpCacheBackend(serverOptions.varnish_host, serverOptions.varnish_http_port)
        );
    }

    if (serverOptions.fastly &&
        !!serverOptions.fastly.enabled && !!serverOptions.fastly.apiKey && !!serverOptions.fastly.serviceId) {
        surrogateKeysCacheBackends.push(
            new FastlyCacheBackend(serverOptions.fastly.apiKey, serverOptions.fastly.serviceId)
        );
    }

    var surrogateKeysCache = new SurrogateKeysCache(surrogateKeysCacheBackends);

    function invalidateNamedMap (owner, templateName) {
        var startTime = Date.now();
        surrogateKeysCache.invalidate(new NamedMapsCacheEntry(owner, templateName), function(err) {
            var logMessage = JSON.stringify({
                username: owner,
                type: 'named_map_invalidation',
                elapsed: Date.now() - startTime,
                error: !!err ? JSON.stringify(err.message) : undefined
            });
            if (err) {
                console.warn(logMessage);
            } else {
                console.info(logMessage);
            }
        });
    }
    ['update', 'delete'].forEach(function(eventType) {
        templateMaps.on(eventType, invalidateNamedMap);
    });

    serverOptions.grainstore.mapnik_version = mapnikVersion(serverOptions);

    validateOptions(serverOptions);

    bootstrapFonts(serverOptions);

    // initialize express server
    var app = bootstrap(serverOptions);
    // Extend windshaft with all the elements of the options object
    _.extend(app, serverOptions);

    var mapStore  = new windshaft.storage.MapStore({
        pool: redisPool,
        expire_time: serverOptions.grainstore.default_layergroup_ttl
    });
    app.mapStore = mapStore;

    var onTileErrorStrategy;
    if (global.environment.enabledFeatures.onTileErrorStrategy !== false) {
        onTileErrorStrategy = function onTileErrorStrategy$TimeoutTile(err, tile, headers, stats, format, callback) {
            if (err && err.message === 'Render timed out' && format === 'png') {
                return callback(null, timeoutErrorTile, { 'Content-Type': 'image/png' }, {});
            } else {
                return callback(err, tile, headers, stats);
            }
        };
    }

    var rendererFactory = new windshaft.renderer.Factory({
        onTileErrorStrategy: onTileErrorStrategy,
        mapnik: {
            redisPool: redisPool,
            grainstore: serverOptions.grainstore,
            mapnik: serverOptions.renderer.mapnik
        },
        http: serverOptions.renderer.http
    });

    // initialize render cache
    var rendererCacheOpts = _.defaults(serverOptions.renderCache || {}, {
        ttl: 60000, // 60 seconds TTL by default
        statsInterval: 60000, // reports stats every milliseconds defined here
        beforeRendererCreate: function(req, callback) {
            var user = cdbRequest.userByReq(req);

            var rendererOptions = {};

            step(
                function getLimits(err) {
                    assert.ifError(err);
                    metadataBackend.getTilerRenderLimit(user, this);
                },
                function handleTilerLimits(err, renderLimit) {
                    assert.ifError(err);
                    rendererOptions.limits = {
                        cacheOnTimeout: serverOptions.renderer.mapnik.limits.cacheOnTimeout || false,
                        render: renderLimit || serverOptions.renderer.mapnik.limits.render || 0
                    };
                    return null;
                },
                function finish(err) {
                    if (err) {
                        return callback(err);
                    }

                    return callback(null, rendererOptions);
                }
            );
        }
    });
    var rendererCache = new windshaft.cache.RendererCache(rendererCacheOpts, mapStore, rendererFactory);
    var mapBackend = new windshaft.backend.Map(rendererCache, mapStore);
    var staticMapBackend = new windshaft.backend.StaticMap(rendererCache);

    app.findStatusCode = function(err) {
        var statusCode;
        if ( err.http_status ) {
            statusCode = err.http_status;
        } else {
            statusCode = statusFromErrorMessage('' + err);
        }
        return statusCode;
    };

    /*******************************************************************************************************************
     * Routing
     ******************************************************************************************************************/

    var namedLayersAdapter = new MapConfigNamedLayersAdapter(templateMaps);
    var layergroupRequestDecorator = {
        beforeLayergroupCreate: function(req, requestMapConfig, callback) {
            namedLayersAdapter.getLayers(cdbRequest.userByReq(req), requestMapConfig.layers, pgConnection,
                function(err, layers, datasource) {
                    if (err) {
                        return callback(err);
                    }

                    if (layers) {
                        requestMapConfig.layers = layers;
                    }
                    return callback(null, requestMapConfig, datasource);
                }
            );
        },
        afterLayergroupCreate: function(req, mapconfig, response, callback) {
            var token = response.layergroupid;

            var username = cdbRequest.userByReq(req);

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

            // include in layergroup response the variables in serverMedata
            // those variables are useful to send to the client information
            // about how to reach this server or information about it
            var serverMetadata = global.environment.serverMetadata;
            if (serverMetadata) {
                _.extend(response, serverMetadata);
            }

            // Don't wait for the mapview count increment to
            // take place before proceeding. Error will be logged
            // asyncronously
            metadataBackend.incMapviewCount(username, mapconfig.stat_tag, function(err) {
                if (req.profiler) {
                    req.profiler.done('incMapviewCount');
                }
                if ( err ) {
                    console.log("ERROR: failed to increment mapview count for user '" + username + "': " + err);
                }
                done();
            });

            var sql = mapconfig.layers.map(function(layer) {
                return layer.options.sql;
            }).join(';');

            var dbName = req.params.dbname;
            var cacheKey = dbName + ':' + token;

            step(
                function getAffectedTablesAndLastUpdatedTime() {
                    queryTablesApi.getAffectedTablesAndLastUpdatedTime(username, sql, this);
                },
                function handleAffectedTablesAndLastUpdatedTime(err, result) {
                    if (req.profiler) {
                        req.profiler.done('queryTablesAndLastUpdated');
                    }
                    assert.ifError(err);
                    var cacheChannel = app.buildCacheChannel(dbName, result.affectedTables);
                    app.channelCache[cacheKey] = cacheChannel;

                    // last update for layergroup cache buster
                    response.layergroupid = response.layergroupid + ':' + result.lastUpdatedTime;
                    response.last_updated = new Date(result.lastUpdatedTime).toISOString();

                    var res = req.res;
                    if (res) {
                        if (req.method === 'GET') {
                            var ttl = global.environment.varnish.layergroupTtl || 86400;
                            res.header('Cache-Control', 'public,max-age='+ttl+',must-revalidate');
                            res.header('Last-Modified', (new Date()).toUTCString());
                            res.header('X-Cache-Channel', cacheChannel);
                        }

                        res.header('X-Layergroup-Id', response.layergroupid);
                    }

                    return null;
                },
                function finish(err) {
                    done(err);
                }
            );
        }
    };

    var mapController = new MapController(app, mapBackend, layergroupRequestDecorator);
    mapController.register(app);

    var staticMapsController = new StaticMapsController(app, staticMapBackend);
    staticMapsController.register(app);

    var NamedMapsController = require('./controllers/named_maps'),
        namedMapsController = new NamedMapsController(
            app,
            serverOptions,
            templateMaps,
            metadataBackend,
            mapBackend,
            template_baseurl,
            surrogateKeysCache,
            layergroupRequestDecorator
        );
    namedMapsController.register(app);

    var TablesExtentApi = require('./api/tables_extent_api');
    var tablesExtentApi = new TablesExtentApi(pgQueryRunner);

    var NamedStaticMapsController = require('./controllers/named_static_maps');
    var namedStaticMapsController = new NamedStaticMapsController(
        app,
        serverOptions,
        templateMaps,
        mapBackend,
        staticMapBackend,
        surrogateKeysCache,
        tablesExtentApi,
        layergroupRequestDecorator
    );
    namedStaticMapsController.register(app);


    var healthCheck = new HealthCheck();
    app.get('/health', function(req, res) {
        var healthConfig = global.environment.health || {};

        if (!!healthConfig.enabled) {
            var startTime = Date.now();
            healthCheck.check(healthConfig, function(err, result) {
                var ok = !err;
                var response = {
                    enabled: true,
                    ok: ok,
                    elapsed: Date.now() - startTime,
                    result: result
                };
                if (err) {
                    response.err = err.message;
                }
                res.send(response, ok ? 200 : 503);

            });
        } else {
            res.send({enabled: false, ok: true}, 200);
        }
    });

    // simple testable route
    app.get('/', function(req, res) {
        app.sendResponse(res, [WELCOME_MSG]);
    });

    // version
    app.get('/version', function(req, res) {
        app.sendResponse(res, [app.getVersion(), 200]);
    });

    /*******************************************************************************************************************
     * END Routing
     ******************************************************************************************************************/

        // temporary measure until we upgrade to newer version expressjs so we can check err.status
    app.use(function(err, req, res, next) {
        if (err) {
            if (err.name === 'SyntaxError') {
                app.sendError(res, { errors: [err.name + ': ' + err.message] }, 400, 'JSON', err);
            } else {
                next(err);
            }
        } else {
            next();
        }
    });

    app.getVersion = function() {
        return {
            windshaft: windshaft.version,
            grainstore: grainstore.version(),
            node_mapnik: mapnik.version,
            mapnik: mapnik.versions.mapnik,
            windshaft_cartodb: require('../../package.json').version
        };
    };


    // GET routes for which we don't want to request any caching.
    // POST/PUT/DELETE requests are never cached anyway.
    var noCacheGETRoutes = [
        '/',
        '/version',
        // See https://github.com/CartoDB/Windshaft-cartodb/issues/176
        serverOptions.base_url_mapconfig,
        serverOptions.base_url_mapconfig + '/static/named/:template_id/:width/:height.:format',
        template_baseurl,
        template_baseurl + '/:template_id',
        template_baseurl + '/:template_id/jsonp'
    ];

    app.sendResponse = function(res, args) {
        var that = this;

        var statusCode;
        if ( res._windshaftStatusCode ) {
            // Added by our override of sendError
            statusCode = res._windshaftStatusCode;
        } else {
            if ( args.length > 2 ) statusCode = args[2];
            else {
                statusCode = args[1] || 200;
            }
        }
        var req = res.req;
        step (
            function addCacheChannel() {
                if ( ! req ) {
                    // having no associated request can happen when
                    // using fake response objects for testing layergroup
                    // creation
                    return false;
                }
                if ( ! req.params ) {
                    // service requests (/version, /)
                    // have no need for an X-Cache-Channel
                    return false;
                }
                if ( statusCode != 200 ) {
                    // We do not want to cache
                    // unsuccessful responses
                    return false;
                }
                if ( _.contains(noCacheGETRoutes, req.route.path) ) {
//console.log("Skipping cache channel in route:\n" + req.route.path);
                    return false;
                }
//console.log("Adding cache channel to route\n" + req.route.path + " not matching any in:\n" +
// mapCreateRoutes.join("\n"));
                app.addCacheChannel(that, req, this);
            },
            function sendResponse(err/*, added*/) {
                if ( err ) console.log(err + err.stack);
                // When using custom results from tryFetch* methods,
                // there is no "req" link in the result object.
                // In those cases we don't want to send stats now
                // as they will be sent at the real end of request
                var req = res.req;

                if (global.environment && global.environment.api_hostname) {
                    res.header('X-Served-By-Host', global.environment.api_hostname);
                }

                if (req && req.params && req.params.dbhost) {
                    res.header('X-Served-By-DB-Host', req.params.dbhost);
                }

                if ( req && req.profiler ) {
                    res.header('X-Tiler-Profiler', req.profiler.toJSONString());
                }

                res.send.apply(res, args);

                if ( req && req.profiler ) {
                    try {
                        // May throw due to dns, see
                        // See http://github.com/CartoDB/Windshaft/issues/166
                        req.profiler.sendStats();
                    } catch (err) {
                        console.error("error sending profiling stats: " + err);
                    }
                }
                return null;
            },
            function finish(err) {
                if ( err ) console.log(err + err.stack);
            }
        );
    };

    app.sendWithHeaders = function(res, what, status, headers) {
        app.sendResponse(res, [what, headers, status]);
    };

    app.sendError = function(res, err, statusCode, label, tolog) {
        res._windshaftStatusCode = statusCode;

        var olabel = '[';
        if ( label ) {
            olabel += label + ' ';
        }
        olabel += 'ERROR]';
        if ( ! tolog ) {
            tolog = err;
        }
        var log_msg = olabel + " -- " + statusCode + ": " + tolog;
        //if ( tolog.stack ) log_msg += "\n" + tolog.stack;
        console.error(log_msg); // use console.log for statusCode != 500 ?
        // If a callback was requested, force status to 200
        if ( res.req ) {
            // NOTE: res.req can be undefined when we fake a call to
            //       ourself from POST to /layergroup
            if ( res.req.query.callback ) {
                statusCode = 200;
            }
        }
        // Strip connection info, if any
        // See https://github.com/CartoDB/Windshaft/issues/173
        err = JSON.stringify(err);
        err = err.replace(/Connection string: '[^']*'\\n/, '');
        // See https://travis-ci.org/CartoDB/Windshaft/jobs/20703062#L1644
        err = err.replace(/is the server.*encountered/im, 'encountered');
        err = JSON.parse(err);

        app.sendResponse(res, [err, statusCode]);
    };

    // jshint maxcomplexity:10
    /**
     * Whitelist input and get database name & default geometry type from
     * subdomain/user metadata held in CartoDB Redis
     * @param req - standard express request obj. Should have host & table
     * @param callback
     */
    app.req2params = function(req, callback){

        if ( req.query.lzma ) {

            // Decode (from base64)
            var lzma = new Buffer(req.query.lzma, 'base64')
                .toString('binary')
                .split('')
                .map(function(c) {
                    return c.charCodeAt(0) - 128;
                });

            // Decompress
            lzmaWorker.decompress(
                lzma,
                function(result) {
                    if (req.profiler) {
                        req.profiler.done('lzma');
                    }
                    try {
                        delete req.query.lzma;
                        _.extend(req.query, JSON.parse(result));
                        app.req2params(req, callback);
                    } catch (err) {
                        callback(new Error('Error parsing lzma as JSON: ' + err));
                    }
                }
            );
            return;
        }

        req.query = _.pick(req.query, REQUEST_QUERY_PARAMS_WHITELIST);
        req.params = _.extend({}, req.params); // shuffle things as request is a strange array/object

        var user = cdbRequest.userByReq(req);

        if ( req.params.token ) {
            // Token might match the following patterns:
            // - {user}@{tpl_id}@{token}:{cache_buster}
            //console.log("Request parameters include token " + req.params.token);
            var tksplit = req.params.token.split(':');
            req.params.token = tksplit[0];
            if ( tksplit.length > 1 ) {
                req.params.cache_buster= tksplit[1];
            }
            tksplit = req.params.token.split('@');
            if ( tksplit.length > 1 ) {
                req.params.signer = tksplit.shift();
                if ( ! req.params.signer ) {
                    req.params.signer = user;
                }
                else if ( req.params.signer !== user ) {
                    var err = new Error(
                        'Cannot use map signature of user "' + req.params.signer + '" on db of user "' + user + '"'
                    );
                    err.http_status = 403;
                    callback(err);
                    return;
                }
                if ( tksplit.length > 1 ) {
                    /*var template_hash = */tksplit.shift(); // unused
                }
                req.params.token = tksplit.shift();
                //console.log("Request for token " + req.params.token + " with signature from " + req.params.signer);
            }
        }

        // bring all query values onto req.params object
        _.extend(req.params, req.query);

        if (req.profiler) {
            req.profiler.done('req2params.setup');
        }

        step(
            function getPrivacy(){
                app.authorize(req, this);
            },
            function gatekeep(err, authorized){
                if (req.profiler) {
                    req.profiler.done('authorize');
                }
                assert.ifError(err);
                if(!authorized) {
                    err = new Error("Sorry, you are unauthorized (permission denied)");
                    err.http_status = 403;
                    throw err;
                }
                return null;
            },
            function getDatabase(err){
                assert.ifError(err);
                pgConnection.setDBConn(user, req.params, this);
            },
            function finishSetup(err) {
                if ( err ) { callback(err, req); return; }

                // Add default database connection parameters
                // if none given
                _.defaults(req.params, {
                    dbuser: global.environment.postgres.user,
                    dbpassword: global.environment.postgres.password,
                    dbhost: global.environment.postgres.host,
                    dbport: global.environment.postgres.port
                });

                callback(null, req);
            }
        );
    };

    // TODO: review lifetime of elements of this cache
    // NOTE: by-token indices should only be dropped when
    //       the corresponding layegroup is dropped, because
    //       we have no SQL after layer creation.
    app.channelCache = {};

    app.buildCacheChannel = function (dbName, tableNames){
        return dbName + ':' + tableNames.join(',');
    };

    app.generateCacheChannel = function(app, req, callback){
        // Build channelCache key
        var dbName = req.params.dbname;
        var cacheKey = [ dbName, req.params.token ].join(':');

        // no token means no tables associated
        if (!req.params.token) {
            return callback(null, this.buildCacheChannel(dbName, []));
        }

        step(
            function checkCached() {
                if ( app.channelCache.hasOwnProperty(cacheKey) ) {
                    return callback(null, app.channelCache[cacheKey]);
                }
                return null;
            },
            function extractSQL(err) {
                assert.ifError(err);

                // TODO: cached cache channel for token-based access should
                //       be constructed at renderer cache creation time
                // See http://github.com/CartoDB/Windshaft-cartodb/issues/152
                if ( ! app.mapStore ) {
                    throw new Error('missing channel cache for token ' + req.params.token);
                }
                var mapStore = app.mapStore;

                step(
                    function loadFromStore() {
                        mapStore.load(req.params.token, this);
                    },
                    function getSQL(err, mapConfig) {
                        if (req.profiler) {
                            req.profiler.done('mapStore_load');
                        }
                        assert.ifError(err);

                        var queries = mapConfig.getLayers()
                            .map(function(lyr) {
                                return lyr.options.sql;
                            })
                            .filter(function(sql) {
                                return !!sql;
                            });

                        return queries.length ? queries.join(';') : null;
                    },
                    this
                );
            },
            function findAffectedTables(err, sql) {
                assert.ifError(err);

                if ( ! sql ) {
                    throw new Error("this request doesn't need an X-Cache-Channel generated");
                }

                queryTablesApi.getAffectedTablesInQuery(cdbRequest.userByReq(req), sql, this); // in addCacheChannel
            },
            function buildCacheChannel(err, tableNames) {
                assert.ifError(err);

                if (req.profiler) {
                    req.profiler.done('affectedTables');
                }

                var cacheChannel = app.buildCacheChannel(dbName,tableNames);
                app.channelCache[cacheKey] = cacheChannel;

                return cacheChannel;
            },
            function finish(err, cacheChannel) {
                callback(err, cacheChannel);
            }
        );
    };

    // Set the cache chanel info to invalidate the cache on the frontend server
    //
    // @param req The request object.
    //            The function will have no effect unless req.res exists.
    //            It is expected that req.params contains 'table' and 'dbname'
    //
    // @param cb function(err, channel) will be called when ready.
    //           the channel parameter will be null if nothing was added
    //
    app.addCacheChannel = function(app, req, cb) {
        // skip non-GET requests, or requests for which there's no response
        if ( req.method != 'GET' || ! req.res ) { cb(null, null); return; }
        if (req.profiler) {
            req.profiler.start('addCacheChannel');
        }
        var res = req.res;
        if ( req.params.token ) {
            res.header('Cache-Control', 'public,max-age=31536000'); // 1 year
        } else {
            var ttl = global.environment.varnish.ttl || 86400;
            res.header('Cache-Control', 'no-cache,max-age='+ttl+',must-revalidate, public');
        }

        // Set Last-Modified header
        var lastUpdated;
        if ( req.params.cache_buster ) {
            // Assuming cache_buster is a timestamp
            // FIXME: store lastModified in the cache channel instead
            lastUpdated = new Date(parseInt(req.params.cache_buster));
        } else {
            lastUpdated = new Date();
        }
        res.header('Last-Modified', lastUpdated.toUTCString());

        app.generateCacheChannel(app, req, function(err, channel){
            if (req.profiler) {
                req.profiler.done('generateCacheChannel');
                req.profiler.end();
            }
            if ( ! err ) {
                res.header('X-Cache-Channel', channel);
                cb(null, channel);
            } else {
                console.log('ERROR generating cache channel: ' + ( err.message ? err.message : err ));
                // TODO: evaluate if we should bubble up the error instead
                cb(null, 'ERROR');
            }
        });
    };

    // Check if a request is authorized by a signer
    //
    // @param req express request object
    // @param callback function(err, signed_by) signed_by will be
    //                 null if the request is not signed by anyone
    //                 or will be a string cartodb username otherwise.
    //
    app.authorizedBySigner = function(req, callback) {
        if ( ! req.params.token || ! req.params.signer ) {
            return callback(null, false); // no signer requested
        }

        var layergroup_id = req.params.token;
        var auth_token = req.params.auth_token;

        mapStore.load(layergroup_id, function(err, mapConfig) {
            if (err) {
                return callback(err);
            }

            var authorized = templateMaps.isAuthorized(mapConfig.obj().template, auth_token);

            return callback(null, authorized);
        });
    };

    // Check if a request is authorized by api_key
    //
    // @param user
    // @param req express request object
    // @param callback function(err, authorized)
    //        NOTE: authorized is expected to be 0 or 1 (integer)
    //
    app.authorizedByAPIKey = function(user, req, callback) {
        var givenKey = req.query.api_key || req.query.map_key;
        if ( ! givenKey && req.body ) {
            // check also in request body
            givenKey = req.body.api_key || req.body.map_key;
        }
        if ( ! givenKey ) {
            return callback(null, 0); // no api key, no authorization...
        }
        step(
            function () {
                metadataBackend.getUserMapKey(user, this);
            },
            function checkApiKey(err, val){
                assert.ifError(err);
                return val && givenKey == val;
            },
            function finish(err, authorized) {
                callback(err, authorized);
            }
        );
    };

    /**
     * Check access authorization
     *
     * @param req - standard req object. Importantly contains table and host information
     * @param callback function(err, allowed) is access allowed not?
     */
    app.authorize = function(req, callback) {
        var self = this;
        var user = cdbRequest.userByReq(req);

        step(
            function () {
                self.authorizedByAPIKey(user, req, this);
            },
            function checkApiKey(err, authorized){
                if (req.profiler) {
                    req.profiler.done('authorizedByAPIKey');
                }
                assert.ifError(err);

                // if not authorized by api_key, continue
                if (!authorized)  {
                    // not authorized by api_key, check if authorized by signer
                    return self.authorizedBySigner(req, this);
                }

                // authorized by api key, login as the given username and stop
                pgConnection.setDBAuth(user, req.params, function(err) {
                    callback(err, true); // authorized (or error)
                });
            },
            function checkSignAuthorized(err, authorized) {
                if (err) {
                    return callback(err);
                }

                if ( ! authorized ) {
                    // request not authorized by signer.

                    // if no signer name was given, let dbparams and
                    // PostgreSQL do the rest.
                    //
                    if ( ! req.params.signer ) {
                        return callback(null, true); // authorized so far
                    }

                    // if signer name was given, return no authorization
                    return callback(null, false);
                }

                pgConnection.setDBAuth(user, req.params, function(err) {
                    if (req.profiler) {
                        req.profiler.done('setDBAuth');
                    }
                    callback(err, true); // authorized (or error)
                });
            }
        );
    };

    app.setDBParams = function(cdbuser, params, callback) {
        step(
            function setAuth() {
                pgConnection.setDBAuth(cdbuser, params, this);
            },
            function setConn(err) {
                if ( err ) throw err;
                pgConnection.setDBConn(cdbuser, params, this);
            },
            function finish(err) {
                callback(err);
            }
        );
    };

    app.doCORS = function(res, extraHeaders) {
        if (serverOptions.enable_cors) {
            var baseHeaders = "X-Requested-With, X-Prototype-Version, X-CSRF-Token";
            if(extraHeaders) {
                baseHeaders += ", " + extraHeaders;
            }
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Headers", baseHeaders);
        }
    };

    return app;
};

function validateOptions(opts) {
    if (!_.isString(opts.base_url) || !_.isString(opts.base_url_mapconfig)) {
        throw new Error("Must initialise Windshaft with: 'base_url'/'base_url_mapconfig' URLs");
    }

    // Be nice and warn if configured mapnik version is != instaled mapnik version
    if (mapnik.versions.mapnik !== opts.grainstore.mapnik_version) {
        console.warn('WARNING: detected mapnik version (' + mapnik.versions.mapnik + ')' +
            ' != configured mapnik version (' + opts.grainstore.mapnik_version + ')');
    }
}

function bootstrapFonts(opts) {
    // Set carto renderer configuration for MMLStore
    opts.grainstore.carto_env = opts.grainstore.carto_env || {};
    var cenv = opts.grainstore.carto_env;
    cenv.validation_data = cenv.validation_data || {};
    if ( ! cenv.validation_data.fonts ) {
        mapnik.register_system_fonts();
        mapnik.register_default_fonts();
        cenv.validation_data.fonts = _.keys(mapnik.fontFiles());
    }
}

function bootstrap(opts) {
    var app;
    if (_.isObject(opts.https)) {
        // use https if possible
        app = express.createServer(opts.https);
    } else {
        // fall back to http by default
        app = express.createServer();
    }
    app.enable('jsonp callback');
    app.use(express.bodyParser());

    app.use(function createRequestContext(req, res, next) {
        req.context = req.context || {};
        next();
    });

    // Use our step-profiler
    app.use(function(req, res, next) {
        req.profiler = new windshaft.stats.Profiler({
            statsd_client: global.statsClient,
            profile: opts.useProfiler
        });
        next();
    });

    setupLogger(app, opts);

    return app;
}

function setupLogger(app, opts) {
    if (opts.log_format) {
        var loggerOpts = {
            // Allowing for unbuffered logging is mainly
            // used to avoid hanging during unit testing.
            // TODO: provide an explicit teardown function instead,
            //       releasing any event handler or timer set by
            //       this component.
            buffer: !opts.unbuffered_logging,
            // optional log format
            format: opts.log_format
        };
        if (global.log4js) {
            app.use(global.log4js.connectLogger(global.log4js.getLogger(), _.defaults(loggerOpts, {level: 'info'})));
        } else {
            app.use(express.logger(loggerOpts));
        }
    }
}

function statusFromErrorMessage(errMsg) {
    // Find an appropriate statusCode based on message
    var statusCode = 400;
    if ( -1 !== errMsg.indexOf('permission denied') ) {
        statusCode = 403;
    }
    else if ( -1 !== errMsg.indexOf('authentication failed') ) {
        statusCode = 403;
    }
    else if (errMsg.match(/Postgis Plugin.*[\s|\n].*column.*does not exist/)) {
        statusCode = 400;
    }
    else if ( -1 !== errMsg.indexOf('does not exist') ) {
        if ( -1 !== errMsg.indexOf(' role ') ) {
            statusCode = 403; // role 'xxx' does not exist
        } else {
            statusCode = 404;
        }
    }
    return statusCode;
}

function mapnikVersion(opts) {
    return opts.grainstore.mapnik_version || mapnik.versions.mapnik;
}
