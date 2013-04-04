var _             = require('underscore'),
    Varnish       = require('node-varnish'),
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

module.exports = {
    init: init,
    invalidate_db: invalidate_db
}
