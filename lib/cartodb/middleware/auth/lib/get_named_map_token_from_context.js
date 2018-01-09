'use strict';

const LayergroupToken = require('../../../models/layergroup-token');

module.exports = function getNamedMapTokenFromContext(context) {
    if ( ! context.token) {
        return null;
    }

    return LayergroupToken.parse(context.token);
};
