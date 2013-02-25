var   _          = require('underscore')
    , Step       = require('step')
    , cartoData  = require('./carto_data')
    , Cache = require('./cache_validator')
    , mapnik     = require('mapnik')
  ;

module.exports = function(){

    var rendererConfig = _.defaults(global.environment.renderer || {}, {
      cache_ttl: 60000,
      metatile: 4,
      bufferSize: 64
    });

    var me = {
        base_url: '/tiles/:table',
        base_url_notable: '/tiles',
        grainstore: {
          datasource: global.environment.postgres,
          cachedir: global.environment.millstone.cache_basedir,
          mapnik_version: global.environment.mapnik_version || mapnik.versions.mapnik
        },
        mapnik: {
          metatile: rendererConfig.metatile,
          bufferSize: rendererConfig.bufferSize
        },
        renderCache: {
          ttl: rendererConfig.cache_ttl
        },
        redis: global.environment.redis,
        enable_cors: global.environment.enable_cors,
        varnish_host: global.environment.varnish.host,
        varnish_port: global.environment.varnish.port,
        cache_enabled: global.environment.cache_enabled,
        log_format: global.environment.log_format
    };

    // Be nice and warn if configured mapnik version
    // is != instaled mapnik version
    if ( mapnik.versions.mapnik != me.grainstore.mapnik_version ) {
      console.warn("WARNING: detected mapnik version ("
        + mapnik.versions.mapnik + ") != configured mapnik version ("
        + me.grainstore.mapnik_version + ")");
    }

    // Set the cache chanel info to invalidate the cache on the frontend server
    //
    // @param req The request object.
    //            The function will have no effect unless req.res exists.
    //            It is expected that req.params contains 'table' and 'dbname'
    //
    // @param cb function(err, channel) will be called when ready.
    //           the channel parameter will be null if nothing was added
    //
    me.addCacheChannel = function(req, cb) {
        // skip non-GET requests, or requests for which there's no response
        if ( req.method != 'GET' || ! req.res ) { cb(null, null); return; }
        var res = req.res;
        var ttl = global.environment.varnish.ttl || 86400;
        Cache.generateCacheChannel(req, function(channel){
            res.header('X-Cache-Channel', channel);
            var cache_policy = req.query.cache_policy;
            if ( cache_policy == 'persist' ) {
              res.header('Cache-Control', 'public,max-age=31536000'); // 1 year
            } else {
              res.header('Last-Modified', new Date().toUTCString());
              res.header('Cache-Control', 'no-cache,max-age='+ttl+',must-revalidate, public');
            }
            cb(null, channel); // add last-modified too ?
        });
    }

    /**
     * Whitelist input and get database name & default geometry type from
     * subdomain/user metadata held in CartoDB Redis
     * @param req - standard express request obj. Should have host & table
     * @param callback
     */
    me.req2params = function(req, callback){

        // Whitelist query parameters and attach format
        var good_query = ['sql', 'geom_type', 'cache_buster', 'cache_policy', 'callback', 'interactivity', 'map_key', 'api_key', 'style', 'style_version', 'style_convert' ];
        var bad_query  = _.difference(_.keys(req.query), good_query);

        _.each(bad_query, function(key){ delete req.query[key]; });
        req.params =  _.extend({}, req.params); // shuffle things as request is a strange array/object

        // bring all query values onto req.params object
        _.extend(req.params, req.query);

        // for cartodb, ensure interactivity is cartodb_id or user specified
        req.params.interactivity = req.params.interactivity || 'cartodb_id';

        req.params.processXML = function(req, xml, callback) {
          var dbuser = req.dbuser ? req.dbuser : global.settings.postgres.user;
          if ( ! me.rx_dbuser ) me.rx_dbuser = /(<Parameter name="user"><!\[CDATA\[)[^\]]*(]]><\/Parameter>)/;
          xml = xml.replace(me.rx_dbuser, "$1" + dbuser + "$2");
          callback(null, xml);
        }

        var that = this;

        Step(
            function getPrivacy(){
                cartoData.authorize(req, this);
            },
            function gatekeep(err, data){
                if(err) throw err;
                if(data === "0") throw new Error("Sorry, you are unauthorized (permission denied)");
                return data;
            },
            function getDatabase(err, data){
                if(err) throw err;

                cartoData.getDatabase(req, this);
            },
            function getGeometryType(err, data){
                if (err) throw err;
                _.extend(req.params, {dbname:data});

                cartoData.getGeometryType(req, this);
            },
            function finishSetup(err, data){
                if ( err ) { callback(err, req); return; }

                if (!_.isNull(data))
                    _.extend(req.params, {geom_type: data});

                that.addCacheChannel(req, function(err, chan) {
                  callback(err, req);
                });
            }
        );
    };

    /**
     * Little helper method to get the current list of infowindow variables and return to client
     * @param req
     * @param callback
     */
    me.getInfowindow = function(req, callback){
        var that = this;

        Step(
            function(){
                that.req2params(req, this);
            },
            function(err, data){
                if (err) callback(err, null);
                else cartoData.getInfowindow(data, callback);
            }
        );
    };

    /**
     * Little helper method to get map metadata and return to client
     * @param req
     * @param callback
     */
    me.getMapMetadata = function(req, callback){
        var that = this;

        Step(
            function(){
                that.req2params(req, this);
            },
            function(err, data){
                if (err) callback(err, null);
                else cartoData.getMapMetadata(data, callback);
            }
        );
    };

    /**
     * Helper to clear out tile cache on request
     * @param req
     * @param callback
     */
    me.flushCache = function(req, Cache, callback){
        var that = this;

        Step(
            function(){
                that.req2params(req, this);
            },
            function(err, data){
                if (err) throw err;
                if(Cache) {
                  Cache.invalidate_db(req.params.dbname, req.params.table);
                }
                callback(null, true);
            }
        );
    };

    return me;
}();
