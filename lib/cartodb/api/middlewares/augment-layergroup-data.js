'use strict';

const _ = require('underscore');

module.exports = function augmentLayergroupData () {
    return function augmentLayergroupDataMiddleware (req, res, next) {
        const layergroup = res.body;

        // include in layergroup response the variables in serverMedata
        // those variables are useful to send to the client information
        // about how to reach this server or information about it
        _.extend(layergroup, global.environment.serverMetadata);

        next();
    };
};
