'use strict';

module.exports = function clientHeader () {
    return function clientHeaderMiddleware (req, res, next) {
        const { client } = req.query;

        if (client) {
            res.set('Carto-Client', client);
        }

        return next();
    };
};
