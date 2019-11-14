'use strict';

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
            tileBackend
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

    route (apiRouter, routes) {
        const templateRouter = router({ mergeParams: true });

        routes.forEach(route => {
            const { paths, middlewares = [] } = route;

            middlewares.forEach(middleware => templateRouter.use(middleware()));

            this.namedMapController.route(templateRouter);
            this.tileTemplateController.route(templateRouter);
            this.adminTemplateController.route(templateRouter);

            paths.forEach(path => apiRouter.use(path, templateRouter));
        });
    }
};
