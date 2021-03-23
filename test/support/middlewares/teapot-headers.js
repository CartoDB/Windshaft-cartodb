exports.middlewares = [
    function () {
        return function teapotHeaderMiddleware (req, res, next) {
            res.header('X-What-Am-I', 'I\'m a teapot');
            return next();
        };
    },
    function () {
        return function teapotAnotherHeaderMiddleware (req, res, next) {
            res.header('X-Again-What-Am-I', 'I\'m a teapot');
            return next();
        };
    }
];
