var   _          = require('underscore')
    , Step       = require('step')
    , cartoData  = require('./carto_data');

module.exports = function(){
    var me = {
        base_url: '/tiles/:table',
        grainstore: {datasource: global.environment.postgres},
        redis: global.environment.redis,
        enable_cors: global.environment.enable_cors,
        varnish_host: global.environment.varnish.host,
        varnish_port: global.environment.varnish.port,
        cache_enabled: global.environment.cache_enabled,
        log_format: '[:date] :req[X-Real-IP] \033[90m:method\033[0m \033[36m:req[Host]:url\033[0m \033[90m:status :response-time ms -> :res[Content-Type]\033[0m'
    };

    /**
     * Whitelist input and get database name & default geometry type from
     * subdomain/user metadata held in CartoDB Redis
     * @param req - standard express request obj. Should have host & table
     * @param callback
     */
    me.req2params = function(req, callback){

        // Whitelist query parameters and attach format
        var good_query = ['sql', 'geom_type', 'cache_buster','callback', 'interactivity', 'map_key', 'style'];
        var bad_query  = _.difference(_.keys(req.query), good_query);

        _.each(bad_query, function(key){ delete req.query[key]; });
        req.params =  _.extend({}, req.params); // shuffle things as request is a strange array/object

        // bring all query values onto req.params object
        _.extend(req.params, req.query);

        // for cartodb, ensure interactivity is cartodb_id or user specified
        req.params.interactivity = req.params.interactivity || 'cartodb_id';

        Step(
            function getPrivacy(){
                cartoData.authorize(req, this);
            },
            function gatekeep(err, data){
                if(err) throw err;
                if(data === "0") throw new Error("Sorry, you are unauthorized");
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
                if (!_.isNull(data))
                    _.extend(req.params, {geom_type: data});

                callback(err, req);
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
                if (err) throw err;
                cartoData.getMapMetadata(data, callback);
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
                Cache.invalidate_db(req.params.dbname, req.params.table);
                callback(null, true);
            }
        );
    };

    return me;
}();
