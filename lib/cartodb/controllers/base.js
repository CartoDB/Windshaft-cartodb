var debug = require('debug')('windshaft:cartodb');

function BaseController() {
}

module.exports = BaseController;

// jshint maxcomplexity:9
BaseController.prototype.send = function(req, res, body, status, headers) {
    res.set('X-Tiler-Profiler', req.profiler.toJSONString());

    if (headers) {
        res.set(headers);
    }

    res.status(status);

    if (!Buffer.isBuffer(body) && typeof body === 'object') {
        if (req.query && req.query.callback) {
            res.jsonp(body);
        } else {
            res.json(body);
        }
    } else {
        res.send(body);
    }

    try {
        // May throw due to dns, see
        // See http://github.com/CartoDB/Windshaft/issues/166
        req.profiler.sendStats();
    } catch (err) {
        debug("error sending profiling stats: " + err);
    }
};
// jshint maxcomplexity:6
