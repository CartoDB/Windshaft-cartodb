module.exports = function setMetadataToLayergroup (layergroupMetadata, includeQuery) {
    return function setMetadataToLayergroupMiddleware (req, res, next) {
        const { user, mapConfig, analysesResults = [], context } = res.locals;
        const layergroup = res.body;

        layergroupMetadata.addDataviewsAndWidgetsUrls(user, layergroup, mapConfig.obj());
        layergroupMetadata.addAnalysesMetadata(user, layergroup, analysesResults, includeQuery);
        layergroupMetadata.addTurboCartoContextMetadata(layergroup, mapConfig.obj(), context);
        layergroupMetadata.addAggregationContextMetadata(layergroup, mapConfig.obj(), context);
        layergroupMetadata.addTileJsonMetadata(layergroup, user, mapConfig);

        next();
    };
};
