exports.middlewares = function () {
    return function teapotMiddleware (req, res, next) {
        if (req.path === '/') {
            return res.status(418).send('I\'m a teapot');
        }
        next();
    };
};
