'use strict';

const { Router: router } = require('express');

const AnalysisLayergroupController = require('./analysis-layergroup-controller');
const AttributesLayergroupController = require('./attributes-layergroup-controller');
const DataviewLayergroupController = require('./dataview-layergroup-controller');
const PreviewLayergroupController = require('./preview-layergroup-controller');
const TileLayergroupController = require('./tile-layergroup-controller');
const AnonymousMapController = require('./anonymous-map-controller');
const PreviewTemplateController = require('./preview-template-controller');
const AnalysesCatalogController = require('./analyses-catalog-controller');
const ClusteredFeaturesLayergroupController = require('./clustered-features-layergroup-controller');

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
            tablesExtentBackend,
            clusterBackend
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

        this.clusteredFeaturesLayergroupController = new ClusteredFeaturesLayergroupController(
            clusterBackend,
            pgConnection,
            mapStore,
            userLimitsBackend,
            layergroupAffectedTablesCache,
            authBackend,
            surrogateKeysCache
        );
    }

    route (apiRouter, routes) {
        const mapRouter = router({ mergeParams: true });

        routes.forEach(route => {
            const { paths, middlewares = [] } = route;

            middlewares.forEach(middleware => mapRouter.use(middleware()));

            this.analysisLayergroupController.route(mapRouter);
            this.attributesLayergroupController.route(mapRouter);
            this.dataviewLayergroupController.route(mapRouter);
            this.previewLayergroupController.route(mapRouter);
            this.tileLayergroupController.route(mapRouter);
            this.anonymousMapController.route(mapRouter);
            this.previewTemplateController.route(mapRouter);
            this.analysesController.route(mapRouter);
            this.clusteredFeaturesLayergroupController.route(mapRouter);

            paths.forEach(path => apiRouter.use(path, mapRouter));
        });
    }
};
