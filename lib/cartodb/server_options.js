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
  // Only use "host" as "domain" if it contains alphanumeric characters
  var host = global.environment.sqlapi.host;
  if ( host && host.match(/[a-zA-Z]/) ) {
    global.environment.sqlapi.domain = host;
  }
}

module.exports = function(){

    var rendererConfig = _.defaults(global.environment.renderer || {}, {
      cache_ttl: 60000, // milliseconds
      metatile: 4,
      bufferSize: 64
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
          mapnik_version: global.environment.mapnik_version || mapnik.versions.mapnik,
          default_layergroup_ttl: global.environment.mapConfigTTL || 7200, 
          gc_prob: 0.01 // @deprecated since Windshaft-1.8.0
        },
        mapnik: {
          metatile: rendererConfig.metatile,
          bufferSize: rendererConfig.bufferSize
        },
        statsd: global.environment.statsd,
        renderCache: {
          ttl: rendererConfig.cache_ttl
        },
        redis: global.environment.redis,
        enable_cors: global.environment.enable_cors,
        varnish_host: global.environment.varnish.host,
        varnish_port: global.environment.varnish.port,
        varnish_secret: global.environment.varnish.secret,
        cache_enabled: global.environment.cache_enabled,
        log_format: global.environment.log_format,
        useProfiler: global.environment.useProfiler
    };
    
    // Do not send unwatch on release
    // See http://github.com/CartoDB/Windshaft-cartodb/issues/161
    me.redis.unwatchOnRelease = false;

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
      var sqlapihostname = username;
      if ( api.domain ) sqlapihostname += '.' + api.domain;

      var sqlapi = api.protocol + '://';
      if ( api.host && api.host != api.domain ) sqlapi += api.host;
      else sqlapi += sqlapihostname;
      sqlapi += ':' + api.port + '/api/' + api.version + '/sql';

      var qs  = { q: sql }

      // add api_key if given
      if (_.isString(api_key) && api_key != '') { qs.api_key = api_key; }

      // call sql api
      //
      // NOTE: using POST to avoid size limits:
      // See http://github.com/CartoDB/Windshaft-cartodb/issues/111
      //
      // NOTE: uses "host" header to allow IP based specification
      //       of sqlapi address (and avoid a DNS lookup)
      //
      // NOTE: allows for keeping up to "maxConnections" concurrent
      //       sockets opened per SQL-API host.
      // See http://nodejs.org/api/http.html#http_agent_maxsockets
      //
      var maxSockets = global.environment.maxConnections || 128;
      var maxGetLen = api.max_get_sql_length || 2048;
      var maxSQLTime = api.timeout || 100; // 1/10 of a second by default
      var reqSpec = {
            url:sqlapi,
            json:true,
            headers:{host: sqlapihostname}
            // http://nodejs.org/api/http.html#http_agent_maxsockets
            ,pool:{maxSockets:maxSockets}
            // timeout in milliseconds
            ,timeout:maxSQLTime
      }
      if ( sql.length > maxGetLen ) {
        reqSpec.method = 'POST';
        reqSpec.body = qs;
      } else {
        reqSpec.method = 'GET';
        reqSpec.qs = qs;
      }
      request(reqSpec, function(err, res, body) {
          if (err){
            console.log('ERROR connecting to SQL API on ' + sqlapi + ': ' + err);
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
          tableNames = tableNames ? tableNames.split(',') : [];
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

    me.generateCacheChannel = function(app, req, callback){

      // Build channelCache key
      var dbName = req.params.dbname;
      var cacheKey = [ dbName ];
      if ( req.params.token ) cacheKey.push(req.params.token);
      else if ( req.params.sql ) cacheKey.push( me.generateMD5(req.params.sql) );
      cacheKey = cacheKey.join(':');

      var that = this;

      Step (
        function checkCached() {
          if ( me.channelCache.hasOwnProperty(cacheKey) ) {
            callback(null, me.channelCache[cacheKey]);
            return;
          }
          return null;
        },
        function extractSQL(err) {
          if ( err ) throw err;

          if ( req.params.token ) {
            // TODO: cached cache channel for token-based access should
            //       be constructed at renderer cache creation time
            // See http://github.com/CartoDB/Windshaft-cartodb/issues/152
            if ( ! app.mapStore ) {
              throw new Error('missing channel cache for token ' + req.params.token);
              return;
            }
            var next = this;
            var mapStore = app.mapStore;
            Step(
              function loadFromStore() {
                mapStore.load(req.params.token, this);
              },
              function getSQL(err, mapConfig) {
                if (req.profiler) req.profiler.done('mapStore_load');
                if ( err ) throw err;
                var sql = [];
                _.each(mapConfig.obj().layers, function(lyr) {
                  sql.push(lyr.options.sql);
                });
                sql = sql.join(';');
                return sql;
              },
              function finish(err, sql) {
                next(err, sql);
              }
            );
            return;
          }

          if ( ! req.params.sql ) {
            return null; // no sql
          }

          // We have sql, and no token...

          // strip out windshaft/mapnik inserted sql if present
          var sql = req.params.sql.match(/^\((.*)\)\sas\scdbq$/);
          sql = (sql != null) ? sql[1] : req.params.sql;

          return sql;
        },
        function findAffectedTables(err, sql) {
          if ( err ) throw err;
          if ( ! sql ) {
            if ( ! req.params.table ) {
              throw new Error("this request doesn't need an X-Cache-Channel generated");
            }
            return [req.params.table];
          }
          var user, key;
          var next = this;
          Step (
            function findUserKey() {
              if ( req.params.hasOwnProperty('_authorizedBySigner') ) {
                user = req.params._authorizedBySigner;
                cartoData.getUserMapKey(user, this);
              } else {
                user = that.userByReq(req);
                key = req.params.map_key || req.params.api_key;
                return null;
              }
            },
            function getAffected(err, data) {
              if ( err ) throw err;
              if ( data ) {
                if ( req.profiler ) req.profiler.done('getSignerMapKey');
                key = data;
              }
              me.affectedTables(user, key, sql, this); // in addCacheChannel
            },
            function finish(err, data) {
              next(err,data);
            }
          );
        },
        function buildCacheChannel(err, tableNames) {
          if ( err ) throw err;
          if (req.profiler && ! req.params.table ) {
            req.profiler.done('affectedTables');
          }

          var dbName     = req.params.dbname;
          var cacheChannel = me.buildCacheChannel(dbName,tableNames);
          // store for caching from me.generateCacheChannel
          // (not worth when table was specified in params)
          if ( ! req.params.table ) {
            me.channelCache[cacheKey] = cacheChannel;
          }
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
        if (req.profiler) req.profiler.start('addCacheChannel');
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

        me.generateCacheChannel(app, req, function(err, channel){
            if (req.profiler) req.profiler.done('generateCacheChannel');
            if (req.profiler) req.profiler.end();
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

        var username = this.userByReq(req);

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
        var usr    = this.userByReq(req);
        var key    = req.params.map_key || req.params.api_key;

        var cacheKey = dbName + ':' + token;
        var tabNames;

        Step(
          function getTables() {
            me.affectedTables(usr, key, sql, this); // in afterLayergroupCreate
          },
          function getLastupdated(err, tableNames) {
            if (req.profiler) req.profiler.done('affectedTables');
            if ( err ) throw err;
            var cacheChannel = me.buildCacheChannel(dbName,tableNames);
            // store for caching from me.afterLayergroupCreate
            me.channelCache[cacheKey] = cacheChannel;
            if (req.res && req.method == 'GET') {
                var res = req.res;
                if ( req.query && req.query.cache_policy == 'persist' ) {
                    res.header('Cache-Control', 'public,max-age=31536000'); // 1 year
                } else {
                    var ttl = global.environment.varnish.ttl || 86400;
                    res.header('Cache-Control', 'public,max-age='+ttl+',must-revalidate');
                }
                res.header('Last-Modified', (new Date()).toUTCString());
                res.header('X-Cache-Channel', cacheChannel);
            }
            // find last updated
            if ( ! tableNames.length ) return 0; // skip for no affected tables
            tabNames = tableNames;
            me.findLastUpdated(usr, key, tableNames, this);
          },
          function(err, lastUpdated) {
            if ( err ) throw err;
            if (req.profiler && tabNames) req.profiler.done('findLastUpdated');
            response.layergroupid = response.layergroupid + ':' + lastUpdated; // use epoch
            response.last_updated = new Date(lastUpdated).toISOString(); 
            return null;
          },
          function finish(err) {
            done(err);
          }
        );
    };

/* X-Cache-Channel generation } */

    me.re_userFromHost = new RegExp(
      global.environment.user_from_host ||
      '^([^\\.]+)\\.' // would extract "strk" from "strk.cartodb.com"
    );

    me.userByReq = function(req) {
      var host = req.headers.host;
      var mat = host.match(this.re_userFromHost);
      if ( ! mat ) {
        console.error("ERROR: user pattern '" + this.re_userFromHost
          + "' does not match hostname '" + host + "'");
        return;
      }
      // console.log("Matches: "); console.dir(mat);
      if ( ! mat.length === 2 ) {
        console.error("ERROR: pattern '" + this.re_userFromHost
          + "' gave unexpected matches against '" + host + "': " + mat);
        return;
      }
      return mat[1];
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
    };

    // Set db connection parameters to those for the given username
    //
    // @param dbowner cartodb username of database owner,
    //                mapped to a database username
    //                via CartodbRedis metadata records
    //
    // @param params the parameters to set connection options into
    //               added params are: "dbname", "dbhost"
    //
    // @param callback function(err) 
    //
    me.setDBConn = function(dbowner, params, callback) {
      // Add default database connection parameters
      // if none given
      _.defaults(params, {
        dbuser: global.environment.postgres.user,
        dbpassword: global.environment.postgres.password,
        dbhost: global.environment.postgres.host,
        dbport: global.environment.postgres.port
      });
      Step(
        function getDatabaseHost(){
            cartoData.getUserDBHost(dbowner, this);
        },
        function getDatabaseSlaves(err, db_host){
            if(err) throw err;
            var that = this;
            if ( global.environment.postgres.use_slaves && db_host ) {
              // query for db slaves and return a random one
              cartoData.getDBSyncSlaves(db_host, function(err, dbhosts) {
                if(err) throw err;
                if(dbhosts.length > 0) {
                  dbhosts.push(db_host); // balance among the slaves and the master
                  db_host = dbhosts[Math.floor(Math.random()*dbhosts.length)];
                }
                that(err, db_host);
              });
            }else{
              //pass through
              that(err, db_host);
            }
        },
        function getDatabase(err, data){
            if(err) throw err;
            if ( data ) _.extend(params, {dbhost:data});
            cartoData.getUserDBName(dbowner, this);
        },
        function extendParams(err, data){
            if (err) throw err;
            if ( data ) _.extend(params, {dbname:data});
            return null;
        },
        function finish(err) {
          callback(err); 
        }
      );
    };


    // Check if a request is authorized by a signer
    //
    // Any existing signature for the given request will verified
    // for authorization to this specific request (may require auth_token)
    // See https://github.com/CartoDB/Windshaft-cartodb/wiki/Signed-maps
    //
    // @param req express request object
    // @param callback function(err, signed_by) signed_by will be
    //                 null if the request is not signed by anyone
    //                 or will be a string cartodb username otherwise.
    //                 
    me.authorizedBySigner = function(req, callback)
    {
      if ( ! req.params.token || ! req.params.signer ) {
        //console.log("No signature provided"); // debugging
        callback(null, null); // no signer requested
        return;
      }

      var signer = req.params.signer;
      var layergroup_id = req.params.token;
      var auth_token = req.params.auth_token;

      //console.log("Checking authorization from signer " + signer + " for resource " + layergroup_id + " with auth_token " + auth_token);

      me.signedMaps.isAuthorized(signer, layergroup_id, auth_token,
        function(err, authorized) {
          callback(err, authorized ? signer : null);
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
        var user = me.userByReq(req);
        Step(
          function (){
              cartoData.getUserMapKey(user, this);
          },
          function checkApiKey(err, val){
              if (err) throw err;
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
        var user = me.userByReq(req);

        Step(
            function (){
                that.authorizedByAPIKey(req, this);
            },
            function checkApiKey(err, authorized){
                if (req.profiler) req.profiler.done('authorizedByAPIKey');
                if (err) throw err;

                // if not authorized by api_key, continue 
                if (authorized !== 1)  {
                  // not authorized by api_key, 
                  // check if authorized by signer
                  that.authorizedBySigner(req, this);
                  return;
                }

                _.extend(req.params, { _authorizedByApiKey: true });

                // authorized by api key, login as the given username and stop
                that.setDBAuth(user, req.params, function(err) {
                  callback(err, true); // authorized (or error)
                });
            },
            function checkSignAuthorized(err, signed_by){
                if (err) throw err;
                if (req.profiler) {
                  if ( req.params._authorizedByApiKey ) {
                    req.profiler.done('setDBAuth');
                  } else {
                    req.profiler.done('authorizedBySigner');
                  }
                }

                if ( ! signed_by ) {
                  // request not authorized by signer.
  
                  // if table was given, continue to check table privacy
                  if ( req.params.table ) return null;

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

                // Authorized by "signed_by" !
                _.extend(req.params, { _authorizedBySigner: signed_by });
                that.setDBAuth(signed_by, req.params, function(err) {
                  if (req.profiler) req.profiler.done('setDBAuth');
                  callback(err, true); // authorized (or error)
                });
            },
            function getDatabase(err){
                if (err) throw err;
                // NOTE: only used to get to table privacy
                cartoData.getUserDBName(user, this);
            },
            function getPrivacy(err, dbname){
                if (err) throw err;
                if (req.profiler) req.profiler.done('tablePrivacy_getUserDBName');
                cartoData.getTablePrivacy(dbname, req.params.table, this);
            },
            function(err, privacy){
                if (req.profiler) req.profiler.done('getTablePrivacy');
                callback(err, privacy !== "0");
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
        var good_query = ['sql', 'geom_type', 'cache_buster', 'cache_policy', 'callback', 'interactivity', 'map_key', 'api_key', 'auth_token', 'style', 'style_version', 'style_convert', 'config' ];
        var bad_query  = _.difference(_.keys(req.query), good_query);

        _.each(bad_query, function(key){ delete req.query[key]; });
        req.params =  _.extend({}, req.params); // shuffle things as request is a strange array/object

        var user = me.userByReq(req);

        if ( req.params.token ) {
          //console.log("Request parameters include token " + req.params.token);
          var tksplit = req.params.token.split(':');
          req.params.token = tksplit[0];
          if ( tksplit.length > 1 ) req.params.cache_buster= tksplit[1];
          tksplit = req.params.token.split('@');
          if ( tksplit.length > 1 ) {
            req.params.signer = tksplit.shift();
            if ( ! req.params.signer ) req.params.signer = user;
            else if ( req.params.signer != user ) {
              var err = new Error('Cannot use map signature of user "' + req.params.signer + '" on database of user "' + user + '"')
              err.http_status = 403;
              callback(err);
              return;
            }
            if ( tksplit.length > 1 ) {
              var template_hash = tksplit.shift(); // unused
            }
            req.params.token = tksplit.shift(); 
            //console.log("Request for token " + req.params.token + " with signature from " + req.params.signer);
          }
        }

        // bring all query values onto req.params object
        _.extend(req.params, req.query);

        // for cartodb, ensure interactivity is cartodb_id or user specified
        req.params.interactivity = req.params.interactivity || 'cartodb_id';

        var that = this;

        if (req.profiler) req.profiler.done('req2params.setup');

        Step(
            function getPrivacy(){
                me.authorize(req, this);
            },
            function gatekeep(err, authorized){
                if (req.profiler) req.profiler.done('authorize');
                if(err) throw err;
                if(!authorized) {
                  err = new Error("Sorry, you are unauthorized (permission denied)");
                  err.http_status = 403;
                  throw err;
                }
                return null;
            },
            function getDatabase(err){
                if(err) throw err;
                that.setDBConn(user, req.params, this);
            },
            function getGeometryType(err){
                if (req.profiler) req.profiler.done('setDBConn');
                if (err) throw err;
                if ( ! req.params.table ) return null;
                cartoData.getTableGeometryType(req.params.dbname, req.params.table, this);
            },
            function finishSetup(err, data){
                if (req.profiler) req.profiler.done('cartoData.getTableGeometryType');
                if ( err ) { callback(err, req); return; }

                if (!_.isNull(data))
                    _.extend(req.params, {geom_type: data});

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

    /**
     * Little helper method to get the current list of infowindow variables and return to client
     * @param req
     * @param callback
     */
    me.getInfowindow = function(req, callback){
        var that = this;
        var user = me.userByReq(req);

        Step(
            function(){
                // TODO: if this step really needed ?
                that.req2params(req, this);
            },
            function getDatabase(err){
                if (err) throw err;
                cartoData.getUserDBName(user, this);
            },
            function getInfowindow(err, dbname){
                if (err) throw err;
                cartoData.getTableInfowindow(dbname, req.params.table, this);
            },
            function(err, data){
                callback(err, data);
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
        var user = me.userByReq(req);

        Step(
            function(){
                // TODO: if this step really needed ?
                that.req2params(req, this);
            },
            function getDatabase(err){
                if (err) throw err;
                cartoData.getUserDBName(user, this);
            },
            function getMapMetadata(err, dbname){
                if (err) throw err;
                cartoData.getTableMapMetadata(dbname, req.params.table, this);
            },
            function(err, data){
                callback(err, data);
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
};
