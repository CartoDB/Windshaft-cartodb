var   _          = require('underscore')
    , Step       = require('step')
    , cartoData  = require('cartodb-redis')(global.environment.redis)
    , Cache = require('./cache_validator')
    , mapnik     = require('mapnik')
    , crypto     = require('crypto')
    , request    = require('request')
    , LZMA       = require('lzma/lzma_worker.js').LZMA
  ;

// This is for backward compatibility with 1.3.3
if ( _.isUndefined(global.environment.sqlapi.domain) ) {
  global.environment.sqlapi.domain = global.environment.sqlapi.host;
}

module.exports = function(){

    var rendererConfig = _.defaults(global.environment.renderer || {}, {
      cache_ttl: 60000, // milliseconds
      metatile: 4,
      bufferSize: 64
    });

    var me = {
        base_url: '/tiles/:table',
        base_url_notable: '/tiles',
        grainstore: {
          datasource: global.environment.postgres,
          cachedir: global.environment.millstone.cache_basedir,
          mapnik_version: global.environment.mapnik_version || mapnik.versions.mapnik,
          default_layergroup_ttl: 7200, // seconds (default is 300)
          gc_prob: 0.01 // default is 0.01 TODO: make configurable via env config
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
        log_format: global.environment.log_format,
        useProfiler: global.environment.useProfiler
    };

    // Be nice and warn if configured mapnik version
    // is != instaled mapnik version
    if ( mapnik.versions.mapnik != me.grainstore.mapnik_version ) {
      console.warn("WARNING: detected mapnik version ("
        + mapnik.versions.mapnik + ") != configured mapnik version ("
        + me.grainstore.mapnik_version + ")");
    }

/* This whole block is about generating X-Cache-Channel { */

    // TODO: review lifetime of elements of this cache
    // NOTE: by-token indices should only be dropped when
    //       the corresponding layegroup is dropped, because
    //       we have no SQL after layer creation.
    me.channelCache = {};

    // Run a query through the SQL api
    me.sqlQuery = function (username, api_key, sql, callback) {
      var api = global.environment.sqlapi;

      // build up api string
      var sqlapi = api.protocol + '://' + username;
      if ( api.domain ) sqlapi += '.' + api.domain;
      sqlapi += ':' + api.port + '/api/' + api.version + '/sql'

      var qs  = { q: sql }

      // add api_key if given
      if (_.isString(api_key) && api_key != '') { qs.api_key = api_key; }

      // call sql api
      request.get({url:sqlapi, qs:qs, json:true}, function(err, res, body){
          if (err){
            console.log('ERROR running connecting to SQL API on ' + sqlapi + ': ' + err);
            callback(err);
            return;
          }
          if (res.statusCode != 200) {
              var msg = res.body.error ? res.body.error : res.body;
              callback(new Error(msg));
              console.log('unexpected response status (' + res.statusCode + ') for sql query: ' + sql + ': ' + msg);
              return;
          }
          callback(null, body.rows);
      });
    };

    //
    // Invoke callback with number of milliseconds since
    // last update in any of the given tables
    //
    me.findLastUpdated = function (username, api_key, tableNames, callback) {
      var sql = 'SELECT EXTRACT(EPOCH FROM max(updated_at)) as max FROM CDB_TableMetadata m WHERE m.tabname::name = any (\'{'
        + tableNames.join(',') + '}\')';

      // call sql api
      me.sqlQuery(username, api_key, sql, function(err, rows){
          if (err){
            var msg = err.message ? err.message : err;
            callback(new Error('could not find last updated timestamp: ' + msg));
            return;
          }
          // when the table has not updated_at means it hasn't been changed so a default last_updated is set
          var last_updated = 0;
          if(rows.length !== 0) {
            last_updated = rows[0].max || 0;
          }
          callback(null, last_updated*1000);
      });
    };

    me.affectedTables = function (username, api_key, sql, callback) {

      // Replace mapnik tokens
      sql = sql.replace(RegExp('!bbox!', 'g'), 'ST_MakeEnvelope(0,0,0,0)')
               .replace(RegExp('!pixel_width!', 'g'), '1')
               .replace(RegExp('!pixel_height!', 'g'), '1')
            ;

      // Pass to CDB_QueryTables
      sql = 'SELECT CDB_QueryTables($windshaft$' + sql + '$windshaft$)';

      // call sql api
      me.sqlQuery(username, api_key, sql, function(err, rows){
          if (err){
            var msg = err.message ? err.message : err;
            callback(new Error('could not fetch source tables: ' + msg));
            return;
          }
          var qtables = rows[0].cdb_querytables;
          var tableNames = qtables.split(/^\{(.*)\}$/)[1];
          tableNames = tableNames.split(',');
          callback(null, tableNames);
      });
    };

    me.buildCacheChannel = function (dbName, tableNames){
      return dbName + ':' + tableNames.join(',');
    };

    me.generateMD5 = function(data){
        var hash = crypto.createHash('md5');
        hash.update(data);
        return hash.digest('hex');
    }

    me.generateCacheChannel = function(req, callback){

      // use key to call sql api with sql request if present, else
      // just return dbname and table name base key
      var dbName     = req.params.dbname;

      var cacheKey = [ dbName ];
      if ( req.params.token ) cacheKey.push(req.params.token);
      else if ( req.params.sql ) cacheKey.push( me.generateMD5(req.params.sql) );
      cacheKey = cacheKey.join(':');

      if ( me.channelCache.hasOwnProperty(cacheKey) ) {
        callback(null, me.channelCache[cacheKey]);
        return;
      }
      else if ( req.params.token ) {
        // cached cache channel for token-based access should be constructed
        // at cache creation time
        callback(new Error('missing channel cache for token ' + req.params.token));
        return;
      }

      if ( ! req.params.sql && ! req.params.token ) {
        var cacheChannel = me.buildCacheChannel(dbName, [req.params.table]);
        // not worth caching this
        callback(null, cacheChannel);
        return;
      }

      if ( ! req.params.sql ) {
        callback(new Error("this request doesn't need an X-Cache-Channel generated"));
        return;
      }

      var dbName     = req.params.dbname;
      var username   = req.headers.host.split('.')[0];

      // strip out windshaft/mapnik inserted sql if present
      var sql = req.params.sql.match(/^\((.*)\)\sas\scdbq$/);
      sql = (sql != null) ? sql[1] : req.params.sql;

      me.affectedTables(username, req.params.map_key, sql, function(err, tableNames) {
          if ( err ) { callback(err); return; }
          var cacheChannel = me.buildCacheChannel(dbName,tableNames);
          me.channelCache[cacheKey] = cacheChannel; // store for caching
          callback(null, cacheChannel);
      });
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
    me.addCacheChannel = function(req, cb) {
        // skip non-GET requests, or requests for which there's no response
        if ( req.method != 'GET' || ! req.res ) { cb(null, null); return; }
        var res = req.res;
        var cache_policy = req.query.cache_policy;
        if ( req.params.token ) cache_policy = 'persist';
        if ( cache_policy == 'persist' ) {
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

        me.generateCacheChannel(req, function(err, channel){
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

    me.afterLayergroupCreate = function(req, mapconfig, response, callback) {
        var token = response.layergroupid;

        var username = this.dbOwnerByReq(req); // cartoData.userFromHostname(req.headers.host);

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
        }

        // Don't wait for the mapview count increment to
        // take place before proceeding. Error will be logged
        // asyncronously
        cartoData.incMapviewCount(username, mapconfig.stat_tag, function(err) {
          if (req.profiler) req.profiler.done('incMapviewCount');
          if ( err ) console.log("ERROR: failed to increment mapview count for user '" + username + "': " + err);
          done();
        });

        var sql = [];
        _.each(mapconfig.layers, function(lyr) {
          sql.push(lyr.options.sql);
        });
        sql = sql.join(';');

        var dbName = req.params.dbname;
        var usr    = req.headers.host.split('.')[0];
        var key    = req.params.map_key;

        var cacheKey = dbName + ':' + token;

        me.affectedTables(usr, key, sql, function(err, tableNames) {
            if (req.profiler) req.profiler.done('affectedTables');

            if ( err ) { done(err); return; }
            var cacheChannel = me.buildCacheChannel(dbName,tableNames);
            me.channelCache[cacheKey] = cacheChannel; // store for caching
            // find last updated
            me.findLastUpdated(usr, key, tableNames, function(err, lastUpdated) {
              if (req.profiler) req.profiler.done('findLastUpdated');
              if ( err ) { done(err); return; }
              response.layergroupid = response.layergroupid + ':' + lastUpdated; // use epoch
              response.last_updated = new Date(lastUpdated).toISOString(); // TODO: use ISO format
              done(null);
            });
        });
    };

/* X-Cache-Channel generation } */

    me.dbOwnerByReq = function(req) {
        return cartoData.userFromHostname(req.headers.host);
    }

    // Set db authentication parameters to those of the given username
    //
    // @param username the cartodb username, mapped to a database username
    //                 via CartodbRedis metadata records
    //
    // @param params the parameters to set auth options into
    //               added params are: "dbuser" and "dbpassword"
    //
    // @param callback function(err) 
    //
    me.setDBAuth = function(username, params, callback) {

      var user_params = {};
      var auth_user = global.environment.postgres_auth_user;
      var auth_pass = global.environment.postgres_auth_pass;
      Step(
        function getId() {
          cartoData.getUserId(username, this);
        },
        function(err, user_id) {
          if (err) throw err;
          user_params['user_id'] = user_id;
          var dbuser = _.template(auth_user, user_params);
          _.extend(params, {dbuser:dbuser});

          // skip looking up user_password if postgres_auth_pass
          // doesn't contain the "user_password" label 
          if (!auth_pass || ! auth_pass.match(/\buser_password\b/) ) return null;

          cartoData.getUserDBPass(username, this);
        },
        function(err, user_password) {
          if (err) throw err;
          user_params['user_password'] = user_password;
          if ( auth_pass ) {
            var dbpass = _.template(auth_pass, user_params);
            _.extend(params, {dbpassword:dbpass});
          }
          return true;
        },
        function finish(err) {
          callback(err); 
        }
      );
    }

    /**
     * Check access authorization
     *
     * @param req - standard req object. Importantly contains table and host information
     * @param callback function(err, allowed) is access allowed not?
     */
    me.authorize = function(req, callback) {
        var that = this;
        var dbowner = me.dbOwnerByReq(req);

        Step(
            function(){
                cartoData.checkMapKey(req, this);
            },
            function checkApiKey(err, check_result){
                if (err) throw err;

                // if not authorized by api_key, continue 
                if (check_result !== 1) return null;

                // authorized by api key, login as db owner and stop
                that.setDBAuth(dbowner, req.params, function(err) {
                  callback(err, true); // authorized (or error)
                });
            },
            // TODO: check if authorized by layergroup signature
            //       should only be done for GET /layergroup
            function getDatabase(err){
                if (err) throw err;
                // NOTE: only used to get to table privacy
                cartoData.getUserDBName(dbowner, this);
            },
            function getPrivacy(err, dbname){
                if (err) throw err;
                cartoData.getTablePrivacy(dbname, req.params.table, this);
            },
            function(err, privacy){
                callback(err, privacy);
            }
        );
    };

    /**
     * Whitelist input and get database name & default geometry type from
     * subdomain/user metadata held in CartoDB Redis
     * @param req - standard express request obj. Should have host & table
     * @param callback
     */
    me.req2params = function(req, callback){

        if ( req.query.lzma ) {

          // TODO: check ?
          //console.log("type of req.query.lzma is " + typeof(req.query.lzma));

          // Decode (from base64)
          var lzma = (new Buffer(req.query.lzma, 'base64').toString('binary')).split('').map(function(c) { return c.charCodeAt(0) - 128 })

          // Decompress
          LZMA.decompress(
            lzma,
            function(result) {
              if (req.profiler) req.profiler.done('LZMA decompress');
              try {
                delete req.query.lzma
                _.extend(req.query, JSON.parse(result))
                me.req2params(req, callback);
              } catch (err) {
                callback(new Error('Error parsing lzma as JSON: ' + err));
              }
            },
            function(percent) { // progress
              //console.log("LZMA decompression " + percent + "%");
            }
          );
          return;
        }

        // Whitelist query parameters and attach format
        var good_query = ['sql', 'geom_type', 'cache_buster', 'cache_policy', 'callback', 'interactivity', 'map_key', 'api_key', 'style', 'style_version', 'style_convert', 'config' ];
        var bad_query  = _.difference(_.keys(req.query), good_query);

        _.each(bad_query, function(key){ delete req.query[key]; });
        req.params =  _.extend({}, req.params); // shuffle things as request is a strange array/object

        var signer = null;

        if ( req.params.token ) {
          //console.log("Request parameters include token " + req.params.token);
          var tksplit = req.params.token.split(':');
          req.params.token = tksplit[0];
          if ( tksplit.length > 1 ) req.params.cache_buster= tksplit[1];
          tksplit = req.params.token.split('@');
          if ( tksplit.length > 1 ) {
            // signer name defaults to the domain user
            req.params.signer = tksplit[0] || req.headers.host.split('.')[0];
            req.params.token = tksplit[1];
          }
        }

        // bring all query values onto req.params object
        _.extend(req.params, req.query);

        // for cartodb, ensure interactivity is cartodb_id or user specified
        req.params.interactivity = req.params.interactivity || 'cartodb_id';

        req.params.processXML = function(req, xml, callback) {

          // Replace dbuser
          var dbuser = req.params.dbuser || global.environment.postgres.user;
          if ( ! me.rx_dbuser ) me.rx_dbuser = /(<Parameter name="user"><!\[CDATA\[)[^\]]*(]]><\/Parameter>)/g;
          xml = xml.replace(me.rx_dbuser, "$1" + dbuser + "$2");

          // Replace dbpass
          var dbpass = req.params.dbpassword || global.environment.postgres.password;
          if ( ! me.rx_dbpass ) me.rx_dbpass = /(<Parameter name="password"><!\[CDATA\[)[^\]]*(]]><\/Parameter>)/g;
          xml = xml.replace(me.rx_dbpass, "$1" + dbpass + "$2");

          // Replace or set dbhost
          var dbhost = req.params.dbhost || global.environment.postgres.host;
          if ( ! me.rx_dbhost ) me.rx_dbhost = /(<Parameter name="host"><!\[CDATA\[)[^\]]*(]]><\/Parameter>)/g;
          xml = xml.replace(me.rx_dbhost, "$1" + dbhost + "$2");

          callback(null, xml);
        }

        var that = this;

        if (req.profiler) req.profiler.done('req2params.setup');

        var dbowner = me.dbOwnerByReq(req);

        Step(
            function getPrivacy(){
                me.authorize(req, this);
            },
            function gatekeep(err, data){
                if (req.profiler) req.profiler.done('authorize');
                if(err) throw err;
                if(data === "0") throw new Error("Sorry, you are unauthorized (permission denied)");
                return data;
            },
            function getDatabaseHost(err, data){
                if(err) throw err;

                cartoData.getUserDBHost(dbowner, this);
            },
            function getDatabase(err, data){
                if (req.profiler) req.profiler.done('cartoData.getDatabaseHost');
                if(err) throw err;
                if ( data ) _.extend(req.params, {dbhost:data});

                cartoData.getUserDBName(dbowner, this);
            },
            function getGeometryType(err, data){
                if (req.profiler) req.profiler.done('cartoData.getDatabase');
                if (err) throw err;
                _.extend(req.params, {dbname:data});

                cartoData.getTableGeometryType(data, req.params.table, this);
            },
            function finishSetup(err, data){
                if (req.profiler) req.profiler.done('cartoData.getGeometryType');
                if ( err ) { callback(err, req); return; }

                if (!_.isNull(data))
                    _.extend(req.params, {geom_type: data});

                that.addCacheChannel(req, function(err) {
                  if (req.profiler) req.profiler.done('addCacheChannel');
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
            function getParams(){
                // this is mostly to compute req.params.dbname
                that.req2params(req, this);
            },
            function flushInternalCache(err){
                // TODO: implement this, see
                // http://github.com/Vizzuality/Windshaft-cartodb/issues/73
                return true;
            },
            function flushVarnishCache(err){
                if (err) { callback(err); return; }
                if(Cache) {
                  Cache.invalidate_db(req.params.dbname, req.params.table);
                }
                callback(null, true);
            }
        );
    };

    return me;
}();
