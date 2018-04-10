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
            mapStore,
            userLimitsApi,
            layergroupAffectedTablesCache,
            authBackend,
            surrogateKeysCache
        );

        this.attributesLayergroupController = new AttributesLayergroupController(
            attributesBackend,
            pgConnection,
            mapStore,
            userLimitsApi,
            layergroupAffectedTablesCache,
            authBackend,
            surrogateKeysCache
        );

        this.dataviewLayergroupController = new DataviewLayergroupController(
            dataviewBackend,
            pgConnection,
            mapStore,
            userLimitsApi,
            layergroupAffectedTablesCache,
            authBackend,
            surrogateKeysCache
        );

        this.previewLayergroupController = new PreviewLayergroupController(
            previewBackend,
            pgConnection,
            mapStore,
            userLimitsApi,
            layergroupAffectedTablesCache,
            authBackend,
            surrogateKeysCache
        );

        this.tileLayergroupController = new TileLayergroupController(
            tileBackend,
            pgConnection,
            mapStore,
            userLimitsApi,
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
            userLimitsApi,
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
            userLimitsApi
        );

        this.analysesController = new AnalysesCatalogController(
            pgConnection,
            authBackend,
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
