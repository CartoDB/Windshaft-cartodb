'use strict';

/*
    Checks that all the db config object fields are initialized
*/

const createError = require('http-errors');

module.exports = () => function checkDbConfigurationIsCorrectMiddleware(req, res, next) {
    const dbConfig = res.locals.db;
    /* jshint laxbreak: true */

    const isCorrect = (    dbConfig.host 
                        && dbConfig.name
                        && dbConfig.port
                        && dbConfig.masterUser
                        && dbConfig.masterPassword
                        && dbConfig.user
                        && dbConfig.password);

    if (isCorrect) {
        return next();
    } else {
        next(createError(500, 'db-configuration-error'));
    }
};
