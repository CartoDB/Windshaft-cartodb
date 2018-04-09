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
            userLimitsApi,
            layergroupAffectedTablesCache,
            authApi,
            surrogateKeysCache,
            templateMaps,
            mapBackend,
            metadataBackend,
            mapConfigAdapter,
            statsBackend,
            layergroupMetadata,
            namedMapProviderCache,
            tablesExtentApi
        } = collaborators;

        this.analysisLayergroupController = new AnalysisLayergroupController(
            analysisStatusBackend,
            pgConnection,
            mapStore,
            userLimitsApi,
            layergroupAffectedTablesCache,
            authApi,
            surrogateKeysCache
        );

        this.attributesLayergroupController = new AttributesLayergroupController(
            attributesBackend,
            pgConnection,
            mapStore,
            userLimitsApi,
            layergroupAffectedTablesCache,
            authApi,
            surrogateKeysCache
        );

        this.dataviewLayergroupController = new DataviewLayergroupController(
            dataviewBackend,
            pgConnection,
            mapStore,
            userLimitsApi,
            layergroupAffectedTablesCache,
            authApi,
            surrogateKeysCache
        );

        this.previewLayergroupController = new PreviewLayergroupController(
            previewBackend,
            pgConnection,
            mapStore,
            userLimitsApi,
            layergroupAffectedTablesCache,
            authApi,
            surrogateKeysCache
        );

        this.tileLayergroupController = new TileLayergroupController(
            tileBackend,
            pgConnection,
            mapStore,
            userLimitsApi,
            layergroupAffectedTablesCache,
            authApi,
            surrogateKeysCache
        );

        this.anonymousMapController = new AnonymousMapController(
            pgConnection,
            templateMaps,
            mapBackend,
            metadataBackend,
            surrogateKeysCache,
            userLimitsApi,
            layergroupAffectedTablesCache,
            mapConfigAdapter,
            statsBackend,
            authApi,
            layergroupMetadata
        );

        this.previewTemplateController = new PreviewTemplateController(
            namedMapProviderCache,
            previewBackend,
            surrogateKeysCache,
            tablesExtentApi,
            metadataBackend,
            pgConnection,
            authApi,
            userLimitsApi
        );

        this.analysesController = new AnalysesCatalogController(
            pgConnection,
            authApi,
            userLimitsApi
        );
    }

    register (apiRouter) {
        const mapRouter = router();

        this.analysisLayergroupController.register(mapRouter);
        this.attributesLayergroupController.register(mapRouter);
        this.dataviewLayergroupController.register(mapRouter);
        this.previewLayergroupController.register(mapRouter);
        this.tileLayergroupController.register(mapRouter);
        this.anonymousMapController.register(mapRouter);
        this.previewTemplateController.register(mapRouter);
        this.analysesController.register(mapRouter);

        const paths = [
            '/map',
            '/layergroup'
        ];

        apiRouter.use(`(?:${paths.join('|')})`, mapRouter);
    }
};
