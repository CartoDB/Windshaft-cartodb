'use strict';

module.exports = function setLastUpdatedTimeToLayergroup () {
    return function setLastUpdatedTimeToLayergroupMiddleware (req, res, next) {
        const { mapConfigProvider, analysesResults } = res.locals;
        const layergroup = res.body;

        mapConfigProvider.createAffectedTables((err, affectedTables) => {
            if (err) {
                return next(err);
            }

            if (!affectedTables) {
                return next();
            }

            var lastUpdateTime = affectedTables.getLastUpdatedAt();

            lastUpdateTime = getLastUpdatedTime(analysesResults, lastUpdateTime) || lastUpdateTime;

            // last update for layergroup cache buster
            layergroup.layergroupid = layergroup.layergroupid + ':' + lastUpdateTime;
            layergroup.last_updated = new Date(lastUpdateTime).toISOString();

            next();
        });
    };
};

function getLastUpdatedTime (analysesResults, lastUpdateTime) {
    if (!Array.isArray(analysesResults)) {
        return lastUpdateTime;
    }
    return analysesResults.reduce(function (lastUpdateTime, analysis) {
        return analysis.getNodes().reduce(function (lastNodeUpdatedAtTime, node) {
            var nodeUpdatedAtDate = node.getUpdatedAt();
            var nodeUpdatedTimeAt = (nodeUpdatedAtDate && nodeUpdatedAtDate.getTime()) || 0;
            return nodeUpdatedTimeAt > lastNodeUpdatedAtTime ? nodeUpdatedTimeAt : lastNodeUpdatedAtTime;
        }, lastUpdateTime);
    }, lastUpdateTime);
}
