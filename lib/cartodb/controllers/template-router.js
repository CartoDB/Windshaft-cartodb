const { Router: router } = require('express');

const NamedMapController = require('./map/named');
const AdminTemplateController = require('./template/admin');
const TileTemplateController = require('./template/tile');

module.exports = class TemplateRouter {
    constructor ({ collaborators }) {
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

    register (apiRouter) {
        const templateRouter = router();

        this.namedMapController.register(templateRouter);
        this.tileTemplateController.register(templateRouter);
        this.adminTemplateController.register(templateRouter);

        const paths = [
            '/map/named',
            '/template'
        ];

        apiRouter.use(`(?:${paths.join('|')})`, templateRouter);
    }
};
