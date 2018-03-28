const AnonymousMapController = require('./anonymous');
const NamedMapController = require('./named');

module.exports = class MapController {
    constructor (
        pgConnection,
        templateMaps,
        mapBackend,
        metadataBackend,
        surrogateKeysCache,
        userLimitsApi,
        layergroupAffectedTablesCache,
        mapConfigAdapter,
        statsBackend,
        authApi
    ) {
        this.pgConnection = pgConnection;
        this.templateMaps = templateMaps;
        this.mapBackend = mapBackend;
        this.metadataBackend = metadataBackend;
        this.surrogateKeysCache = surrogateKeysCache;
        this.userLimitsApi = userLimitsApi;
        this.layergroupAffectedTablesCache = layergroupAffectedTablesCache;
        this.mapConfigAdapter = mapConfigAdapter;
        this.statsBackend = statsBackend;
        this.authApi = authApi;
    }

    register (mapRouter, templateRouter) {
        const anonymousMapController = new AnonymousMapController(
            this.pgConnection,
            this.templateMaps,
            this.mapBackend,
            this.metadataBackend,
            this.surrogateKeysCache,
            this.userLimitsApi,
            this.layergroupAffectedTablesCache,
            this.mapConfigAdapter,
            this.statsBackend,
            this.authApi
        );

        anonymousMapController.register(mapRouter);

        const namedMapController = new NamedMapController(
            this.pgConnection,
            this.templateMaps,
            this.mapBackend,
            this.metadataBackend,
            this.surrogateKeysCache,
            this.userLimitsApi,
            this.layergroupAffectedTablesCache,
            this.mapConfigAdapter,
            this.statsBackend,
            this.authApi
        );

        namedMapController.register(templateRouter);
    }
};
