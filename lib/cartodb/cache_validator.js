var _             = require('underscore'),
    Varnish       = require('node-varnish'),
    request       = require('request'),
    crypto      = require('crypto'),
    channelCache  = {},
    varnish_queue = null;

function init(host, port) {
    varnish_queue = new Varnish.VarnishQueue(host, port);
}

function invalidate_db(dbname, table) {
    try{
        varnish_queue.run_cmd('purge obj.http.X-Cache-Channel ~ "^' + dbname + ':(.*'+ table +'.*)|(table)$"');
        console.log('[SUCCESS FLUSHING CACHE]');
    } catch (e) {
        console.log("[ERROR FLUSHING CACHE] Is enable_cache set to true? Failed for: " + 'purge obj.http.X-Cache-Channel ~ "^' + dbname + ':(.*'+ table +'.*)|(table)$"');
    }
}

function generateCacheChannel(req, callback){
    var cacheChannel = "";

    // use key to call sql api with sql request if present, else just return dbname and table name
    // base key
    var tableNames = req.params.table;
    var dbName     = req.params.dbname;
    var username   = req.headers.host.split('.')[0];

    // replace tableNames with the results of the explain if present
    if (_.isString(req.params.sql) && req.params.sql != ''){
        // initialise MD5 key of sql for cache lookups
        var sql_md5 = generateMD5(req.params.sql);
        var api = global.environment.sqlapi;
        var qs  = {};

        // use cache if present
        if (!_.isNull(channelCache[sql_md5]) && !_.isUndefined(channelCache[sql_md5])) {
            callback(channelCache[sql_md5]);
        } else{
            // strip out windshaft/mapnik inserted sql if present
            var sql = req.params.sql.match(/^\((.*)\)\sas\scdbq$/);
            sql = (sql != null) ? sql[1] : req.params.sql;

            // build up api string
            var sqlapi = api.protocol + '://' + username + '.' + api.host + ':' + api.port + '/api/' + api.version + '/sql'

            // add query to querystring
            qs.q = 'SELECT CDB_QueryTables($windshaft$' + sql + '$windshaft$)';

            // add api_key if present in tile request (means table is private)
            if (_.isString(req.params.map_key) && req.params.map_key != ''){
                qs.api_key = req.params.map_key;
            }

            // call sql api
            request.get({url:sqlapi, qs:qs, json:true}, function(err, response, body){
                if (!err && response.statusCode == 200) {
                    tableNames = body.rows[0].cdb_querytables.split(/^\{(.*)\}$/)[1];
                } else {
                    //oops, no SQL API. Just cache using fallback 'table' key
                    tableNames = 'table';
                }
                cacheChannel = buildCacheChannel(dbName,tableNames);
                channelCache[sql_md5] = cacheChannel; // store for caching
                callback(cacheChannel);
            });
        }
    } else {
        cacheChannel = buildCacheChannel(dbName,tableNames);
        callback(cacheChannel);
    }
}

function buildCacheChannel(dbName, tableNames){
    return dbName + ':' + tableNames;
}

function generateMD5(data){
    var hash = crypto.createHash('md5');
    hash.update(data);
    return hash.digest('hex');
}

module.exports = {
    init: init,
    invalidate_db: invalidate_db,
    generateCacheChannel: generateCacheChannel
}
