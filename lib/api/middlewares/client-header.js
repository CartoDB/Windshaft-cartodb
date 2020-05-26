'use strict';

module.exports = function clientHeader () {
    return function clientHeaderMiddleware (req, res, next) {
        const { client } = req.query;

        res.set('Carto-Client', client);

        return next();
    };
};
