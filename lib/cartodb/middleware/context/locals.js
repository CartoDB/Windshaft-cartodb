module.exports = function localsMiddleware(req, res, next) {
    // save req.params in res.locals
    res.locals = Object.assign(req.params || {}, res.locals);

    next();
};
