var _ = require('underscore');
var step = require('step');
var LZMA = require('lzma').LZMA;
var assert = require('assert');
var RedisPool = require('redis-mpool');

var QueryTablesApi = require('./api/query_tables_api');
var PgQueryRunner = require('./backends/pg_query_runner');
var PgConnection = require('./backends/pg_connection');
var TemplateMaps = require('./template_maps.js');
var MapConfigNamedLayersAdapter = require('./models/mapconfig_named_layers_adapter');
var CdbRequest = require('./models/cdb_request');

var timeoutErrorTilePath = __dirname + '/../../assets/render-timeout-fallback.png';
var timeoutErrorTile = require('fs').readFileSync(timeoutErrorTilePath, {encoding: null});

// Whitelist query parameters and attach format
var REQUEST_QUERY_PARAMS_WHITELIST = [
    'config',
    'map_key',
    'api_key',
    'auth_token',
    'callback'
];

module.exports = function(redisPool) {
    redisPool = redisPool || new RedisPool(_.extend(global.environment.redis, {name: 'windshaft:server_options'}));

    var cartoData = require('cartodb-redis')({ pool: redisPool });
    var lzmaWorker = new LZMA();
    var pgConnection = new PgConnection(cartoData);
    var pgQueryRunner = new PgQueryRunner(pgConnection);
    var queryTablesApi = new QueryTablesApi(pgQueryRunner);
    var cdbRequest = new CdbRequest();

    var rendererConfig = _.defaults(global.environment.renderer || {}, {
        cache_ttl: 60000, // milliseconds
        statsInterval: 60000,
        mapnik: {
            poolSize: 8,
            metatile: 2,
            bufferSize: 64,
            snapToGrid: false,
            clipByBox2d: false,
            limits: {}
        },
        http: {}
    });

    var me = {
        // This is for inline maps and table maps
        base_url: global.environment.base_url_legacy || '/tiles/:table',

        /// @deprecated with Windshaft-0.17.0
        ///base_url_notable: '/tiles',

        // This is for Detached maps
        //
        // "maps" is the official, while
        // "tiles/layergroup" is for backward compatibility up to 1.6.x
        //
        base_url_mapconfig: global.environment.base_url_detached || '(?:/maps|/tiles/layergroup)',

        grainstore: {
          map: {
            // TODO: allow to specify in configuration
            srid: 3857
          },
          datasource: global.environment.postgres,
          cachedir: global.environment.millstone.cache_basedir,
          mapnik_version: global.environment.mapnik_version,
          mapnik_tile_format: global.environment.mapnik_tile_format || 'png',
          default_layergroup_ttl: global.environment.mapConfigTTL || 7200
        },
        statsd: global.environment.statsd,
        renderCache: {
            ttl: rendererConfig.cache_ttl,
            statsInterval: rendererConfig.statsInterval
        },
        renderer: {
            mapnik: rendererConfig.mapnik,
            http: rendererConfig.http
        },
        redis: global.environment.redis,
        enable_cors: global.environment.enable_cors,
        varnish_host: global.environment.varnish.host,
        varnish_port: global.environment.varnish.port,
        varnish_http_port: global.environment.varnish.http_port,
        varnish_secret: global.environment.varnish.secret,
        varnish_purge_enabled: global.environment.varnish.purge_enabled,
        fastly: global.environment.fastly || {},
        cache_enabled: global.environment.cache_enabled,
        log_format: global.environment.log_format,
        useProfiler: global.environment.useProfiler
    };
    
    // Do not send unwatch on release
    // See http://github.com/CartoDB/Windshaft-cartodb/issues/161
    me.redis.unwatchOnRelease = false;

    // Re-use redisPool
    me.redis.pool = redisPool;

    // Re-use pgConnection
    me.pgConnection = pgConnection;
    // Re-use pgQueryRunner
    me.pgQueryRunner = pgQueryRunner;

    var templateMaps = new TemplateMaps(redisPool, {
        max_user_templates: global.environment.maxUserTemplates
    });
    me.templateMaps = templateMaps;

    var mapConfigNamedLayersAdapter = new MapConfigNamedLayersAdapter(templateMaps);

/* This whole block is about generating X-Cache-Channel { */

    // TODO: review lifetime of elements of this cache
    // NOTE: by-token indices should only be dropped when
    //       the corresponding layegroup is dropped, because
    //       we have no SQL after layer creation.
    me.channelCache = {};

    me.buildCacheChannel = function (dbName, tableNames){
      return dbName + ':' + tableNames.join(',');
    };

    me.generateCacheChannel = function(app, req, callback){
        // Build channelCache key
        var dbName = req.params.dbname;
        var cacheKey = [ dbName, req.params.token ].join(':');

        // no token means no tables associated
        if (!req.params.token) {
            return callback(null, this.buildCacheChannel(dbName, []));
        }

        step(
            function checkCached() {
                if ( me.channelCache.hasOwnProperty(cacheKey) ) {
                    return callback(null, me.channelCache[cacheKey]);
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

                var cacheChannel = me.buildCacheChannel(dbName,tableNames);
                me.channelCache[cacheKey] = cacheChannel;

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
    me.addCacheChannel = function(app, req, cb) {
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

        me.generateCacheChannel(app, req, function(err, channel){
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


    if (global.environment.enabledFeatures.onTileErrorStrategy !== false) {
        me.renderer.onTileErrorStrategy = function(err, tile, headers, stats, format, callback) {
            if (err && err.message === 'Render timed out' && format === 'png') {
                return callback(null, timeoutErrorTile, { 'Content-Type': 'image/png' }, {});
            } else {
                return callback(err, tile, headers, stats);
            }
        };
    }

    me.renderCache.beforeRendererCreate = function(req, callback) {
        var user = cdbRequest.userByReq(req);

        var rendererOptions = {};

        step(
            function getLimits(err) {
                assert.ifError(err);
                cartoData.getTilerRenderLimit(user, this);
            },
            function handleTilerLimits(err, renderLimit) {
                assert.ifError(err);
                rendererOptions.limits = {
                    cacheOnTimeout: rendererConfig.mapnik.limits.cacheOnTimeout || false,
                    render: renderLimit || rendererConfig.mapnik.limits.render || 0
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
    };

    me.beforeLayergroupCreate = function(req, requestMapConfig, callback) {
        mapConfigNamedLayersAdapter.getLayers(cdbRequest.userByReq(req), requestMapConfig.layers, pgConnection,
            function(err, layers, datasource) {
                if (err) {
                    return callback(err);
                }

                requestMapConfig.layers = layers;
                return callback(null, requestMapConfig, datasource);
            }
        );
    };

    me.afterLayergroupCreate = function(req, mapconfig, response, callback) {
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
        cartoData.incMapviewCount(username, mapconfig.stat_tag, function(err) {
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
                var cacheChannel = me.buildCacheChannel(dbName, result.affectedTables);
                me.channelCache[cacheKey] = cacheChannel;

                if (req.res && req.method == 'GET') {
                    var res = req.res;
                    var ttl = global.environment.varnish.layergroupTtl || 86400;
                    res.header('Cache-Control', 'public,max-age='+ttl+',must-revalidate');
                    res.header('Last-Modified', (new Date()).toUTCString());
                    res.header('X-Cache-Channel', cacheChannel);
                }

                // last update for layergroup cache buster
                response.layergroupid = response.layergroupid + ':' + result.lastUpdatedTime;
                response.last_updated = new Date(result.lastUpdatedTime).toISOString();
                return null;
            },
            function finish(err) {
                done(err);
            }
        );
    };

/* X-Cache-Channel generation } */

    // Check if a request is authorized by a signer
    //
    // @param req express request object
    // @param callback function(err, signed_by) signed_by will be
    //                 null if the request is not signed by anyone
    //                 or will be a string cartodb username otherwise.
    //                 
    me.authorizedBySigner = function(req, callback) {
        if ( ! req.params.token || ! req.params.signer ) {
            return callback(null, null); // no signer requested
        }

        var signer = req.params.signer;
        var layergroup_id = req.params.token;
        var auth_token = req.params.auth_token;

        var mapStore = req.app.mapStore;
        if (!mapStore) {
            throw new Error('Unable to retrieve map configuration token');
        }

        mapStore.load(layergroup_id, function(err, mapConfig) {
            if (err) {
                return callback(err);
            }

            var authorized = me.templateMaps.isAuthorized(mapConfig.obj().template, auth_token);

            return callback(null, authorized ? signer : null);
        });
    };

    // Check if a request is authorized by api_key
    //
    // @param req express request object
    // @param callback function(err, authorized) 
    //        NOTE: authorized is expected to be 0 or 1 (integer)
    //                 
    me.authorizedByAPIKey = function(req, callback)
    {
        var givenKey = req.query.api_key || req.query.map_key;
        if ( ! givenKey && req.body ) {
          // check also in request body
          givenKey = req.body.api_key || req.body.map_key;
        }
        if ( ! givenKey ) {
          callback(null, 0); // no api key, no authorization...
          return;
        }
        //console.log("given ApiKey: " + givenKey);
        var user = cdbRequest.userByReq(req);
        step(
          function (){
              cartoData.getUserMapKey(user, this);
          },
          function checkApiKey(err, val){
              assert.ifError(err);
              return ( val && givenKey == val ) ? 1 : 0;
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
    me.authorize = function(req, callback) {
        var that = this;
        var user = cdbRequest.userByReq(req);

        step(
            function (){
                that.authorizedByAPIKey(req, this);
            },
            function checkApiKey(err, authorized){
                if (req.profiler) {
                    req.profiler.done('authorizedByAPIKey');
                }
                assert.ifError(err);

                // if not authorized by api_key, continue 
                if (authorized !== 1)  {
                  // not authorized by api_key, 
                  // check if authorized by signer
                  that.authorizedBySigner(req, this);
                  return;
                }

                // authorized by api key, login as the given username and stop
                pgConnection.setDBAuth(user, req.params, function(err) {
                  callback(err, true); // authorized (or error)
                });
            },
            function checkSignAuthorized(err, signed_by){
                if (err) {
                    return callback(err);
                }

                if ( ! signed_by ) {
                  // request not authorized by signer.

                  // if no signer name was given, let dbparams and
                  // PostgreSQL do the rest.
                  // 
                  if ( ! req.params.signer ) {
                    callback(null, true); // authorized so far
                    return;
                  }

                  // if signer name was given, return no authorization
                  callback(null, false); 
                  return;
                }

                pgConnection.setDBAuth(signed_by, req.params, function(err) {
                  if (req.profiler) {
                      req.profiler.done('setDBAuth');
                  }
                  callback(err, true); // authorized (or error)
                });
            }
        );
    };

    me.setDBParams = function(cdbuser, params, callback) {
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

    // jshint maxcomplexity:10
    /**
     * Whitelist input and get database name & default geometry type from
     * subdomain/user metadata held in CartoDB Redis
     * @param req - standard express request obj. Should have host & table
     * @param callback
     */
    me.req2params = function(req, callback){

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
                me.req2params(req, callback);
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
              var err = new Error('Cannot use map signature of user "' + req.params.signer + '" on database of user "' +
                  user + '"');
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
                me.authorize(req, this);
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

    return me;
};
