'use strict';

module.exports = function noop () {
    return function noopMiddleware (req, res, next) {
        next();
    };
};
