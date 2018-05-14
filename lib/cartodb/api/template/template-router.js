const { Router: router } = require('express');

const NamedMapController = require('./named-template-controller');
const AdminTemplateController = require('./admin-template-controller');
const TileTemplateController = require('./tile-template-controller');

module.exports = class TemplateRouter {
    constructor ({ collaborators }) {
        const {
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
            userLimitsBackend,
            layergroupAffectedTablesCache,
            mapConfigAdapter,
            statsBackend,
            authBackend,
            layergroupMetadata
        );

        this.tileTemplateController = new TileTemplateController(
            namedMapProviderCache,
            tileBackend,
            surrogateKeysCache,
            pgConnection,
            authBackend,
            userLimitsBackend
        );

        this.adminTemplateController = new AdminTemplateController(
            authBackend,
            templateMaps,
            userLimitsBackend
        );
    }

    register (apiRouter, templatePaths) {
        const templateRouter = router({ mergeParams: true });

        this.namedMapController.register(templateRouter);
        this.tileTemplateController.register(templateRouter);
        this.adminTemplateController.register(templateRouter);

        templatePaths.forEach(path => apiRouter.use(path, templateRouter));
    }
};
