'use strict';

module.exports = function setLayerStats (pgConnection, statsBackend) {
    return function setLayerStatsMiddleware (req, res, next) {
        const { user, mapConfig } = res.locals;
        const layergroup = res.body;

        pgConnection.getConnection(user, (err, connection) => {
            if (err) {
                return next(err);
            }

            statsBackend.getStats(mapConfig, connection, function (err, layersStats) {
                if (err) {
                    return next(err);
                }

                if (layersStats.length > 0) {
                    layergroup.metadata.layers.forEach(function (layer, index) {
                        layer.meta.stats = layersStats[index];
                    });
                }

                next();
            });
        });
    };
};
