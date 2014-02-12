var _             = require('underscore'),
    Varnish       = require('node-varnish'),
    varnish_queue = null;

function init(host, port, secret) {
    varnish_queue = new Varnish.VarnishQueue(host, port, secret);
    varnish_queue.on('error', function(e) {
        console.log("[CACHE VALIDATOR ERROR] " + e);
    });
}

function invalidate_db(dbname, table) {
    var cmd = 'purge obj.http.X-Cache-Channel ~ "^' + dbname +
              ':(.*'+ table +'.*)|(table)$"';
    try{
        varnish_queue.run_cmd(cmd, false);
    } catch (e) {
        console.log("[CACHE VALIDATOR ERROR] could not queue command " +
                    cmd + " -- " + e);
    }
}

module.exports = {
    init: init,
    invalidate_db: invalidate_db
}
