function BaseController() {
}

module.exports = BaseController;

BaseController.prototype.send = function(req, res, body, status, headers) {
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
};
