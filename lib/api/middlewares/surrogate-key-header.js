'use strict';

const NamedMapsCacheEntry = require('../../cache/model/named-maps-entry');
const NamedMapMapConfigProvider = require('../../models/mapconfig/provider/named-map-provider');

module.exports = function setSurrogateKeyHeader ({ surrogateKeysCache }) {
    return function setSurrogateKeyHeaderMiddleware (req, res, next) {
        const { user, mapConfigProvider, logger } = res.locals;

        if (mapConfigProvider instanceof NamedMapMapConfigProvider) {
            surrogateKeysCache.tag(res, new NamedMapsCacheEntry(user, mapConfigProvider.getTemplateName()));
        }

        if (req.method !== 'GET') {
            return next();
        }

        mapConfigProvider.getAffectedTables((err, affectedTables) => {
            if (err) {
                logger.warn({ exception: err }, 'Error generating Surrogate Key Header');
                return next();
            }

            if (!affectedTables || !affectedTables.tables || affectedTables.tables.length === 0) {
                return next();
            }

            surrogateKeysCache.tag(res, affectedTables);

            next();
        });
    };
};
