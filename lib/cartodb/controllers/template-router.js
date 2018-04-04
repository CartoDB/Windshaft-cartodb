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

const NamedMapController = require('./map/named');
const AdminTemplateController = require('./template/admin');
const TileTemplateController = require('./template/tile');

module.exports = class TemplateRouter {
    constructor ({ collaborators, serverOptions }) {
        this.serverOptions = serverOptions;

        const {
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
            layergroupMetadata,
            namedMapProviderCache,
            tileBackend,
        } = collaborators;

        this.namedMapController = new NamedMapController(
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

        this.tileTemplateController = new TileTemplateController(
            namedMapProviderCache,
            tileBackend,
            surrogateKeysCache,
            pgConnection,
            authApi,
            userLimitsApi
        );

        this.adminTemplateController = new AdminTemplateController(
            authApi,
            templateMaps,
            userLimitsApi
        );
    }

    register (app) {
        const templateBasePath = this.serverOptions.base_url_templated;

        const templateRouter = router();

        templateRouter.use(logger(this.serverOptions));
        templateRouter.use(bodyParser.json());
        templateRouter.use(servedByHostHeader());
        templateRouter.use(stats({
            enabled: this.serverOptions.useProfiler,
            statsClient: global.statsClient
        }));
        templateRouter.use(lzmaMiddleware());
        templateRouter.use(cors());
        templateRouter.use(user());

        this.namedMapController.register(templateRouter);
        this.tileTemplateController.register(templateRouter);
        this.adminTemplateController.register(templateRouter);

        templateRouter.use(sendResponse());
        templateRouter.use(syntaxError());
        templateRouter.use(errorMiddleware());

        app.use(templateBasePath, templateRouter);
    }
};
