module.exports = function initializeStatusCode () {
    return function initializeStatusCodeMiddleware (req, res, next) {
        res.statusCode = 404;
        next();
    };
};
