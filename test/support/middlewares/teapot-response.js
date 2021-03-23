exports.middlewares = function () {
    return function teapotMiddleware (req, res) {
        res.status(418).send('I\'m a teapot');
    };
};
