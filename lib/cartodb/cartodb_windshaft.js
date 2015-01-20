var _ = require('underscore')
    , Step       = require('step')
    , Windshaft = require('windshaft')
    , SignedMaps = require('./signed_maps.js')
    , TemplateMaps = require('./template_maps.js')
    , Cache = require('./cache_validator')
    , os = require('os')
    , HealthCheck = require('./monitoring/health_check')
;

if ( ! process.env['PGAPPNAME'] )
  process.env['PGAPPNAME']='cartodb_tiler';

var CartodbWindshaft = function(serverOptions) {
   var debug = global.environment.debug;

    // Perform keyword substitution in statsd
    // See https://github.com/CartoDB/Windshaft-cartodb/issues/153
    if ( global.environment.statsd ) {
      if ( global.environment.statsd.prefix ) {
        var host_token = os.hostname().split('.').reverse().join('.');
        global.environment.statsd.prefix = global.environment.statsd.prefix.replace(/:host/, host_token);
      }
    }

    var redisPool = serverOptions.redis.pool
        || require('redis-mpool')(_.extend(global.environment.redis, {name: 'windshaft:cartodb'}));

    var cartoData = require('cartodb-redis')({pool: redisPool});

    if(serverOptions.cache_enabled) {
        console.log("cache invalidation enabled, varnish on ", serverOptions.varnish_host, ' ', serverOptions.varnish_port);
        Cache.init(serverOptions.varnish_host, serverOptions.varnish_port, serverOptions.varnish_secret);
        serverOptions.afterStateChange = function(req, data, callback) {
            Cache.invalidate_db(req.params.dbname, req.params.table);
            callback(null, data);
        }
    }

    serverOptions.beforeStateChange = function(req, callback) {
        var err = null;
        if ( ! req.params.hasOwnProperty('_authorizedByApiKey') ) {
          err = new Error("map state cannot be changed by unauthenticated request!");
        }
        callback(err, req);
    };

    // This is for Templated maps
    //
    // "named" is the official, "template" is for backward compatibility up to 1.6.x
    //
    var template_baseurl = global.environment.base_url_templated || '(?:/maps/named|/tiles/template)';

    serverOptions.signedMaps = new SignedMaps(redisPool);
    var templateMapsOpts = {
      max_user_templates: global.environment.maxUserTemplates
    };
    var templateMaps = new TemplateMaps(redisPool, serverOptions.signedMaps, templateMapsOpts);

    // boot
    var ws = new Windshaft.Server(serverOptions);

    // Override getVersion to include cartodb-specific versions
    var wsversion = ws.getVersion;
    ws.getVersion = function() {
      var version = wsversion();
      version.windshaft_cartodb = require('../../package.json').version;
      return version;
    };

    var ws_sendResponse = ws.sendResponse;
    // GET routes for which we don't want to request any caching.
    // POST/PUT/DELETE requests are never cached anyway.
    var noCacheGETRoutes = [
      '/',
      // See https://github.com/CartoDB/Windshaft-cartodb/issues/176
      serverOptions.base_url_mapconfig,
      template_baseurl + '/:template_id/jsonp'
    ];
    ws.sendResponse = function(res, args) {
      var that = this;
      var thatArgs = arguments;
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
      Step (
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
//console.log("Adding cache channel to route\n" + req.route.path + " not matching any in:\n" + mapCreateRoutes.join("\n"));
          serverOptions.addCacheChannel(that, req, this);
        },
        function sendResponse(err, added) {
          if ( err ) console.log(err + err.stack);
          ws_sendResponse.apply(that, thatArgs);
          return null;
        },
        function finish(err) {
          if ( err ) console.log(err + err.stack);
        }
      );
    };

    var ws_sendError = ws.sendError;
    ws.sendError = function() {
      var res = arguments[0];
      var statusCode = arguments[2];
      res._windshaftStatusCode = statusCode;
      ws_sendError.apply(this, arguments);
    };

    /**
     * Helper to allow access to the layer to be used in the maps infowindow popup.
     */
    ws.get(serverOptions.base_url + '/infowindow', function(req, res){
        ws.doCORS(res);
        Step(
            function(){
                serverOptions.getInfowindow(req, this);
            },
            function(err, data){
                if (err){
                    ws.sendError(res, {error: err.message}, 500, 'GET INFOWINDOW', err);
                    //ws.sendResponse(res, [{error: err.message}, 500]);
                } else {
                    ws.sendResponse(res, [{infowindow: data}, 200]);
                }
            }
        );
    });


    /**
     * Helper to allow access to metadata to be used in embedded maps.
     */
    ws.get(serverOptions.base_url + '/map_metadata', function(req, res){
        ws.doCORS(res);
        Step(
            function(){
                serverOptions.getMapMetadata(req, this);
            },
            function(err, data){
                if (err){
                    ws.sendError(res, {error: err.message}, 500, 'GET MAP_METADATA', err);
                    //ws.sendResponse(res, [err.message, 500]);
                } else {
                    ws.sendResponse(res, [{map_metadata: data}, 200]);
                }
            }
        );
    });

    /**
     * Helper API to allow per table tile cache (and sql cache) to be invalidated remotely.
     * TODO: Move?
     */
    ws.del(serverOptions.base_url + '/flush_cache', function(req, res){
        if ( req.profiler && req.profiler.statsd_client ) {
          req.profiler.start('windshaft-cartodb.flush_cache');
        }
        ws.doCORS(res);
        Step(
            function flushCache(){
                serverOptions.flushCache(req, serverOptions.cache_enabled ? Cache : null, this);
            },
            function sendResponse(err, data){
                if (err){
                    ws.sendError(res, {error: err.message}, 500, 'DELETE CACHE', err);
                    //ws.sendResponse(res, [500]);
                } else {
                    ws.sendResponse(res, [{status: 'ok'}, 200]);
                }
            }
        );
    });

    // ---- Template maps interface starts @{

    ws.userByReq = function(req) {
        return serverOptions.userByReq(req);
    };

    var TemplateMapsController = require('./controllers/template_maps'),
        templateMapsController = new TemplateMapsController(
            ws, templateMaps, serverOptions.signedMaps, cartoData, template_baseurl
        );
    templateMapsController.register(ws);

    // Update a template
    ws.put(template_baseurl + '/:template_id', function(req, res) {
      ws.doCORS(res);
      var that = this;
      var response = {};
      var cdbuser = ws.userByReq(req);
      var template;
      var tpl_id;
      Step(
        function checkPerms(){
            serverOptions.authorizedByAPIKey(req, this);
        },
        function updateTemplate(err, authenticated) {
          if ( err ) throw err;
          if (authenticated !== 1) {
            err = new Error("Only authenticated user can list templated maps");
            err.http_status = 403;
            throw err;
          }
          if ( ! req.headers['content-type'] || req.headers['content-type'].split(';')[0] != 'application/json' )
            throw new Error('template PUT data must be of type application/json');
          template = req.body;
          tpl_id = req.params.template_id.split('@');
          if ( tpl_id.length > 1 ) {
            if ( tpl_id[0] != cdbuser ) {
              err = new Error("Invalid template id '"
                + req.params.template_id + "' for user '" + cdbuser + "'");
              err.http_status = 404;
              throw err;
            }
            tpl_id = tpl_id[1];
          }
          templateMaps.updTemplate(cdbuser, tpl_id, template, this);
        },
        function prepareResponse(err){
          if ( err ) throw err;
          return { template_id: cdbuser + '@' + tpl_id };
        },
        function finish(err, response){
            if ( req.profiler ) {
              res.header('X-Tiler-Profiler', req.profiler.toJSONString());
            }
            if (err){
                var statusCode = 400;
                response = { error: ''+err };
                if ( ! _.isUndefined(err.http_status) ) {
                  statusCode = err.http_status;
                }
                ws.sendError(res, response, statusCode, 'PUT TEMPLATE', err);
            } else {
              ws.sendResponse(res, [response, 200]);
            }
        }
      );
    });

    // Get a specific template
    ws.get(template_baseurl + '/:template_id', function(req, res) {
      if ( req.profiler && req.profiler.statsd_client ) {
        req.profiler.start('windshaft-cartodb.get_template');
      }
      ws.doCORS(res);
      var that = this;
      var response = {};
      var cdbuser = ws.userByReq(req);
      var template;
      var tpl_id;
      Step(
        function checkPerms(){
            serverOptions.authorizedByAPIKey(req, this);
        },
        function updateTemplate(err, authenticated) {
          if ( err ) throw err;
          if (authenticated !== 1) {
            err = new Error("Only authenticated users can get template maps");
            err.http_status = 403;
            throw err;
          }
          tpl_id = req.params.template_id.split('@');
          if ( tpl_id.length > 1 ) {
            if ( tpl_id[0] != cdbuser ) {
              var err = new Error("Cannot get template id '"
                + req.params.template_id + "' for user '" + cdbuser + "'");
              err.http_status = 404;
              throw err;
            }
            tpl_id = tpl_id[1];
          }
          templateMaps.getTemplate(cdbuser, tpl_id, this);
        },
        function prepareResponse(err, tpl_val){
          if ( err ) throw err;
          if ( ! tpl_val ) {
            err = new Error("Cannot find template '" + tpl_id + "' of user '" + cdbuser + "'");
            err.http_status = 404;
            throw err;
          }
          // auth_id was added by ourselves,
          // so we remove it before returning to the user
          delete tpl_val.auth_id;
          return { template: tpl_val };
        },
        function finish(err, response){
            if (err){
                var statusCode = 400;
                response = { error: ''+err };
                if ( ! _.isUndefined(err.http_status) ) {
                  statusCode = err.http_status;
                }
                ws.sendError(res, response, statusCode, 'GET TEMPLATE', err);
            } else {
              ws.sendResponse(res, [response, 200]);
            }
        }
      );
    });

    // Delete a specific template
    ws.del(template_baseurl + '/:template_id', function(req, res) {
      if ( req.profiler && req.profiler.statsd_client ) {
        req.profiler.start('windshaft-cartodb.delete_template');
      }
      ws.doCORS(res);
      var that = this;
      var response = {};
      var cdbuser = ws.userByReq(req);
      var template;
      var tpl_id;
      Step(
        function checkPerms(){
            serverOptions.authorizedByAPIKey(req, this);
        },
        function updateTemplate(err, authenticated) {
          if ( err ) throw err;
          if (authenticated !== 1) {
            err = new Error("Only authenticated users can delete template maps");
            err.http_status = 403;
            throw err;
          }
          tpl_id = req.params.template_id.split('@');
          if ( tpl_id.length > 1 ) {
            if ( tpl_id[0] != cdbuser ) {
              var err = new Error("Cannot find template id '"
                + req.params.template_id + "' for user '" + cdbuser + "'");
              err.http_status = 404;
              throw err;
            }
            tpl_id = tpl_id[1];
          }
          templateMaps.delTemplate(cdbuser, tpl_id, this);
        },
        function prepareResponse(err, tpl_val){
          if ( err ) throw err;
          return { status: 'ok' };
        },
        function finish(err, response){
            if (err){
                var statusCode = 400;
                response = { error: ''+err };
                if ( ! _.isUndefined(err.http_status) ) {
                  statusCode = err.http_status;
                }
                ws.sendError(res, response, statusCode, 'DELETE TEMPLATE', err);
            } else {
              ws.sendResponse(res, ['', 204]);
            }
        }
      );
    });

    // Get a list of owned templates 
    ws.get(template_baseurl, function(req, res) {
      if ( req.profiler && req.profiler.statsd_client ) {
        req.profiler.start('windshaft-cartodb.get_template_list');
      }
      ws.doCORS(res);
      var that = this;
      var response = {};
      var cdbuser = ws.userByReq(req);
      Step(
        function checkPerms(){
            serverOptions.authorizedByAPIKey(req, this);
        },
        function listTemplates(err, authenticated) {
          if ( err ) throw err;
          if (authenticated !== 1) {
            err = new Error("Only authenticated user can list templated maps");
            err.http_status = 403;
            throw err;
          }
          templateMaps.listTemplates(cdbuser, this);
        },
        function prepareResponse(err, tpl_ids){
          if ( err ) throw err;
          // NOTE: might omit "cbduser" if == dbowner ...
          var ids = _.map(tpl_ids, function(id) { return cdbuser + '@' + id; });
          return { template_ids: ids };
        },
        function finish(err, response){
            var statusCode = 200;
            if (err){
                response = { error: ''+err };
                if ( ! _.isUndefined(err.http_status) ) {
                  statusCode = err.http_status;
                }
                ws.sendError(res, response, statusCode, 'GET TEMPLATE LIST', err);
            } else {
              ws.sendResponse(res, [response, statusCode]);
            }
        }
      );
    });

    ws.setDBParams = function(cdbuser, params, callback) {
      Step(
        function setAuth() {
          serverOptions.setDBAuth(cdbuser, params, this);
        },
        function setConn(err) {
          if ( err ) throw err;
          serverOptions.setDBConn(cdbuser, params, this);
        },
        function finish(err) {
          callback(err);
        }
      );
    };

    ws.options(template_baseurl + '/:template_id', function(req, res) {
      ws.doCORS(res, "Content-Type");
      return next();
    });

    // Instantiate a template
    function instanciateTemplate(req, res, template_params, callback) {
      ws.doCORS(res);
      var that = this;
      var response = {};
      var template;
      var signedMaps = serverOptions.signedMaps;
      var layergroup;
      var layergroupid;
      var fakereq; // used for call to createLayergroup
      var cdbuser = ws.userByReq(req);
      // Format of template_id: [<template_owner>]@<template_id>
      var tpl_id = req.params.template_id.split('@');
      if ( tpl_id.length > 1 ) {
        if ( tpl_id[0] && tpl_id[0] != cdbuser ) {
          var err = new Error('Cannot instanciate map of user "'
                              + tpl_id[0] + '" on database of user "'
                              + cdbuser + '"');
          err.http_status = 403;
          callback(err);
          return;
        }
        tpl_id = tpl_id[1];
      }
      var auth_token = req.query.auth_token;
      Step(
        function getTemplate(){
          templateMaps.getTemplate(cdbuser, tpl_id, this);
        },
        function checkAuthorized(err, data) {
          if ( req.profiler ) req.profiler.done('getTemplate');
          if ( err ) throw err;
          if ( ! data ) {
            err = new Error("Template '" + tpl_id + "' of user '" + cdbuser + "' not found");
            err.http_status = 404;
            throw err;
          }
          template = data;
          var cert = templateMaps.getTemplateCertificate(template);
          var authorized = false;
          try {
            // authorizedByCert will throw if unauthorized
            authorized = signedMaps.authorizedByCert(cert, auth_token);
          } catch (err) {
            // we catch to add http_status
            err.http_status = 403;
            throw err;
          }
          if ( ! authorized ) {
            err = new Error('Unauthorized template instanciation');
            err.http_status = 403;
            throw err;
          }
          /*if ( (! req.headers['content-type'] || req.headers['content-type'].split(';')[0] != 'application/json') && req.query.callback === undefined) {
            throw new Error('template POST data must be of type application/json, it is instead ');
          }*/
          //var template_params = req.body;
          if ( req.profiler ) req.profiler.done('authorizedByCert');
          return templateMaps.instance(template, template_params);
        },
        function prepareParams(err, instance){
          if ( req.profiler ) req.profiler.done('TemplateMaps_instance');
          if ( err ) throw err;
          layergroup = instance;
          fakereq = { query: {}, params: {}, headers: _.clone(req.headers),
            method: req.method,
            res: res,
            profiler: req.profiler
          };
          ws.setDBParams(cdbuser, fakereq.params, this);
        },
        function setApiKey(err){
          if ( req.profiler ) req.profiler.done('setDBParams');
          if ( err ) throw err;
          cartoData.getUserMapKey(cdbuser, this);
        },
        function createLayergroup(err, val) {
          if ( req.profiler ) req.profiler.done('getUserMapKey');
          if ( err ) throw err;
          fakereq.params.api_key = val;
          ws.createLayergroup(layergroup, fakereq, this);
        },
        function signLayergroup(err, resp) {
          // NOTE: createLayergroup uses profiler.start()/end() internally
          //if ( req.profiler ) req.profiler.done('createLayergroup');
          if ( err ) throw err;
          response = resp;
          var signer = cdbuser;
          var map_id = response.layergroupid.split(':')[0]; // dropping last_updated 
          var crt_id = template.auth_id; // check ?
          if ( ! crt_id ) {
            var errmsg = "Template '" + tpl_id + "' of user '" + cdbuser + "' has no signature";
            // Is this really illegal ?
            // Maybe we could just return an unsigned layergroupid
            // in this case...
            err = new Error(errmsg);
            err.http_status = 403; // Forbidden, we refuse to respond to this
            throw err;
          }
          signedMaps.signMap(signer, map_id, crt_id, this);
        },
        function prepareResponse(err) {
          if ( req.profiler ) req.profiler.done('signMap');
          if ( err ) throw err;
          //console.log("Response from createLayergroup: "); console.dir(response);
          // Add the signature part to the token!
          var tplhash = templateMaps.fingerPrint(template).substring(0,8);
          if ( req.profiler ) req.profiler.done('fingerPrint');
          response.layergroupid = cdbuser + '@' + tplhash + '@' + response.layergroupid;
          return response;
        },
        callback
      );
    }

    function finish_instanciation(err, response, res, req) {
        if ( req.profiler ) {
          res.header('X-Tiler-Profiler', req.profiler.toJSONString());
        }
        if (err) {
            var statusCode = 400;
            response = { error: ''+err };
            if ( ! _.isUndefined(err.http_status) ) {
              statusCode = err.http_status;
            }
            if(debug) {
              response.stack = err.stack;
            }
            ws.sendError(res, response, statusCode, 'POST INSTANCE TEMPLATE', err);
        } else {
          ws.sendResponse(res, [response, 200]);
        }
    }

    ws.post(template_baseurl + '/:template_id', function(req, res) {
      if ( req.profiler && req.profiler.statsd_client) {
        req.profiler.start('windshaft-cartodb.instance_template_post');
      }
      Step(
        function() {
          if ( ! req.headers['content-type'] || req.headers['content-type'].split(';')[0] != 'application/json') {
            throw new Error('template POST data must be of type application/json, it is instead ');
          }
          instanciateTemplate(req, res, req.body, this);
        }, function(err, response) {
          finish_instanciation(err, response, res, req);
        }
      );
    });


    // ---- Template maps interface ends @}

    var healthCheck = new HealthCheck(cartoData, Windshaft.tilelive);
    ws.get('/health', function(req, res) {
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

    return ws;
};

module.exports = CartodbWindshaft;
