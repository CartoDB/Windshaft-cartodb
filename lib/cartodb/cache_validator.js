var _          = require('underscore'),
    Varnish    = require('node-varnish');

var varnish_queue = null;

function init(host, port) {
    varnish_queue = new Varnish.VarnishQueue(host, port);
}

function invalidate_db(dbname) {
    varnish_queue.run_cmd('purge obj.http.X-Cache-Channel == ' + dbname);
}

module.exports = {
    init: init,
    invalidate_db: invalidate_db
}
