module.exports = function locals () {
    return function localsMiddleware (req, res, next) {
        res.locals = Object.assign({}, req.query, req.params);

        next();
    };
};
