'use strict';

const LayergroupToken = require('../../../models/layergroup-token');

module.exports = function getLayergroupTokenFromContext(context) {
    if (!context.token) {
        return null;
    }

    return LayergroupToken.parse(context.token);
};
