const { Router: router } = require('express');

const AnalysisLayergroupController = require('./analysis-layergroup-controller');
const AttributesLayergroupController = require('./attributes-layergroup-controller');
const DataviewLayergroupController = require('./dataview-layergroup-controller');
const PreviewLayergroupController = require('./preview-layergroup-controller');
const TileLayergroupController = require('./tile-layergroup-controller');
const AnonymousMapController = require('./anonymous-map-controller');
const PreviewTemplateController = require('./preview-template-controller');
const AnalysesCatalogController = require('./analyses-catalog-controller');

module.exports = class MapRouter {
    constructor ({ collaborators }) {
        const {
            analysisStatusBackend,
            attributesBackend,
            dataviewBackend,
            previewBackend,
            tileBackend,
            pgConnection,
            mapStore,
            userLimitsBackend,
            layergroupAffectedTablesCache,
            authBackend,
            surrogateKeysCache,
            templateMaps,
            mapBackend,
            metadataBackend,
            mapConfigAdapter,
            statsBackend,
            layergroupMetadata,
            namedMapProviderCache,
            tablesExtentBackend
        } = collaborators;

        this.analysisLayergroupController = new AnalysisLayergroupController(
            analysisStatusBackend,
            pgConnection,
            userLimitsBackend,
            authBackend
        );

        this.attributesLayergroupController = new AttributesLayergroupController(
            attributesBackend,
            pgConnection,
            mapStore,
            userLimitsBackend,
            layergroupAffectedTablesCache,
            authBackend,
            surrogateKeysCache
        );

        this.dataviewLayergroupController = new DataviewLayergroupController(
            dataviewBackend,
            pgConnection,
            mapStore,
            userLimitsBackend,
            layergroupAffectedTablesCache,
            authBackend,
            surrogateKeysCache
        );

        this.previewLayergroupController = new PreviewLayergroupController(
            previewBackend,
            pgConnection,
            mapStore,
            userLimitsBackend,
            layergroupAffectedTablesCache,
            authBackend,
            surrogateKeysCache
        );

        this.tileLayergroupController = new TileLayergroupController(
            tileBackend,
            pgConnection,
            mapStore,
            userLimitsBackend,
            layergroupAffectedTablesCache,
            authBackend,
            surrogateKeysCache
        );

        this.anonymousMapController = new AnonymousMapController(
            pgConnection,
            templateMaps,
            mapBackend,
            metadataBackend,
            surrogateKeysCache,
            userLimitsBackend,
            layergroupAffectedTablesCache,
            mapConfigAdapter,
            statsBackend,
            authBackend,
            layergroupMetadata
        );

        this.previewTemplateController = new PreviewTemplateController(
            namedMapProviderCache,
            previewBackend,
            surrogateKeysCache,
            tablesExtentBackend,
            metadataBackend,
            pgConnection,
            authBackend,
            userLimitsBackend
        );

        this.analysesController = new AnalysesCatalogController(
            pgConnection,
            authBackend,
            userLimitsBackend
        );
    }

    register (apiRouter, mapPaths) {
        const mapRouter = router({ mergeParams: true });

        this.analysisLayergroupController.register(mapRouter);
        this.attributesLayergroupController.register(mapRouter);
        this.dataviewLayergroupController.register(mapRouter);
        this.previewLayergroupController.register(mapRouter);
        this.tileLayergroupController.register(mapRouter);
        this.anonymousMapController.register(mapRouter);
        this.previewTemplateController.register(mapRouter);
        this.analysesController.register(mapRouter);

        mapPaths.forEach(path => apiRouter.use(path, mapRouter));
    }
};
