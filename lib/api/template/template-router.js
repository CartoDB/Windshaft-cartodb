'use strict';

const { Router: router } = require('express');

const NamedMapController = require('./named-template-controller');
const AdminTemplateController = require('./admin-template-controller');
const TileTemplateController = require('./tile-template-controller');

module.exports = class TemplateRouter {
    constructor ({ collaborators }) {
        this.serverOptions = collaborators.config;

        const {
            config,
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
            metricsBackend
        } = collaborators;

        this.namedMapController = new NamedMapController(
            config,
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
            metricsBackend
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
            const paths = route.paths;

            const preRoutingMiddlewares = route.middlewares;
            if (preRoutingMiddlewares !== undefined && preRoutingMiddlewares.trim()) {
                preRoutingMiddlewares.split(',').forEach(middlewarePath => {
                    try {
                        const middleware = require(middlewarePath).middlewares;
                        if (Array.isArray(middleware)) {
                            middleware.forEach(m => templateRouter.use(m()));
                        } else {
                            templateRouter.use(middleware());
                        }
                    } catch (e) {
                        this.serverOptions.logger.error({ exception: e, path: middlewarePath }, 'Named map routing middleware not found, skipping');
                    }
                });
            }

            this.namedMapController.route(templateRouter);
            this.tileTemplateController.route(templateRouter);
            this.adminTemplateController.route(templateRouter);

            paths.forEach(path => apiRouter.use(path, templateRouter));
        });
    }
};
