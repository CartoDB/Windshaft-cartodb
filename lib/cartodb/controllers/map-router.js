const { Router: router } = require('express');

const logger = require('../middleware/logger');
const bodyParser = require('body-parser');
const servedByHostHeader = require('../middleware/served-by-host-header');
const stats = require('../middleware/stats');
const lzmaMiddleware = require('../middleware/lzma');
const cors = require('../middleware/cors');
const user = require('../middleware/user');
const sendResponse = require('../middleware/send-response');
const syntaxError = require('../middleware/syntax-error');
const errorMiddleware = require('../middleware/error-middleware');

const AnalysisLayergroupController = require('./layergroup/analysis');
const AttributesLayergroupController = require('./layergroup/attributes');
const DataviewLayergroupController = require('./layergroup/dataview');
const PreviewLayergroupController = require('./layergroup/preview');
const TileLayergroupController = require('./layergroup/tile');
const AnonymousMapController = require('./map/anonymous');
const PreviewTemplateController = require('./template/preview');
const AnalysesController = require('./analyses');

module.exports = class MapRouter {
    constructor ({ collaborators, serverOptions }) {
        this.serverOptions = serverOptions;

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

        this.analysesController = new AnalysesController(
            pgConnection,
            authApi,
            userLimitsApi
        );
    }

    register (app) {
        const mapConfigBasePath = this.serverOptions.base_url_mapconfig;

        const mapRouter = router();

        mapRouter.use(logger(this.serverOptions));
        mapRouter.use(bodyParser.json());
        mapRouter.use(servedByHostHeader());
        mapRouter.use(stats({
            enabled: this.serverOptions.useProfiler,
            statsClient: global.statsClient
        }));
        mapRouter.use(lzmaMiddleware());
        mapRouter.use(cors());
        mapRouter.use(user());

        this.analysisLayergroupController.register(mapRouter);
        this.attributesLayergroupController.register(mapRouter);
        this.dataviewLayergroupController.register(mapRouter);
        this.previewLayergroupController.register(mapRouter);
        this.tileLayergroupController.register(mapRouter);
        this.anonymousMapController.register(mapRouter);
        this.previewTemplateController.register(mapRouter);
        this.analysesController.register(mapRouter);

        mapRouter.use(sendResponse());
        mapRouter.use(syntaxError());
        mapRouter.use(errorMiddleware());

        app.use(mapConfigBasePath, mapRouter);
    }
};
