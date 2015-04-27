var _ = require('underscore');
var step = require('step');
var Windshaft = require('windshaft');
var os = require('os');
var HealthCheck = require('./monitoring/health_check');

if ( ! process.env.PGAPPNAME )
  process.env.PGAPPNAME='cartodb_tiler';

var CartodbWindshaft = function(serverOptions) {
    // Perform keyword substitution in statsd
    // See https://github.com/CartoDB/Windshaft-cartodb/issues/153
    if ( global.environment.statsd ) {
      if ( global.environment.statsd.prefix ) {
        var host_token = os.hostname().split('.').reverse().join('.');
        global.environment.statsd.prefix = global.environment.statsd.prefix.replace(/:host/, host_token);
      }
    }

    var redisPool = serverOptions.redis.pool ||
        require('redis-mpool')(_.extend(global.environment.redis, {name: 'windshaft:cartodb'}));

    var cartoData = require('cartodb-redis')({pool: redisPool});

    var templateMaps = serverOptions.templateMaps;

    // This is for Templated maps
    //
    // "named" is the official, "template" is for backward compatibility up to 1.6.x
    //
    var template_baseurl = global.environment.base_url_templated || '(?:/maps/named|/tiles/template)';

    var SurrogateKeysCache = require('./cache/surrogate_keys_cache'),
        NamedMapsCacheEntry = require('./cache/model/named_maps_entry'),
        VarnishHttpCacheBackend = require('./cache/backend/varnish_http'),
        varnishHttpCacheBackend = new VarnishHttpCacheBackend(
            serverOptions.varnish_host,
            serverOptions.varnish_http_port
        ),
        surrogateKeysCache = new SurrogateKeysCache(varnishHttpCacheBackend);

    function invalidateNamedMap (owner, templateName) {
        surrogateKeysCache.invalidate(new NamedMapsCacheEntry(owner, templateName), function(err) {
            if (err) {
                console.warn('Cache: surrogate key invalidation failed');
            }
        });
    }

    if (serverOptions.varnish_purge_enabled) {
        ['update', 'delete'].forEach(function(eventType) {
            templateMaps.on(eventType, invalidateNamedMap);
        });
    }

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
      '/version',
      // See https://github.com/CartoDB/Windshaft-cartodb/issues/176
      serverOptions.base_url_mapconfig,
      template_baseurl,
      template_baseurl + '/:template_id',
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
          serverOptions.addCacheChannel(that, req, this);
        },
        function sendResponse(err/*, added*/) {
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

    /*******************************************************************************************************************
     * Routing
     ******************************************************************************************************************/

    var TemplateMapsController = require('./controllers/template_maps'),
        templateMapsController = new TemplateMapsController(
            ws,
            serverOptions,
            templateMaps,
            cartoData,
            template_baseurl,
            surrogateKeysCache
        );
    templateMapsController.register(ws);

    /*******************************************************************************************************************
     * END Routing
     ******************************************************************************************************************/

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
