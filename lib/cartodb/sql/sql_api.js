var _       = require('underscore'),
    request = require('request');

module.exports.query = function (username, api_key, sql, callback) {
    var api = global.environment.sqlapi;

    // build up api string
    var sqlapihostname = username;
    if ( api.domain ) sqlapihostname += '.' + api.domain;

    var sqlapi = api.protocol + '://';
    if ( api.host && api.host != api.domain ) sqlapi += api.host;
    else sqlapi += sqlapihostname;
    sqlapi += ':' + api.port + '/api/' + api.version + '/sql';

    var qs  = { q: sql };

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
    };
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
