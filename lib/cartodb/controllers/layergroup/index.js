const DataviewBackend = require('../../backends/dataview');
const AnalysisStatusBackend = require('../../backends/analysis-status');

const TileController = require('./tile');
const AttributesController = require('./attributes');
const StaticController = require('./static');
const DataviewController = require('./dataview');
const AnalysisController = require('./analysis');

/**
 * @param {prepareContext} prepareContext
 * @param {PgConnection} pgConnection
 * @param {MapStore} mapStore
 * @param {TileBackend} tileBackend
 * @param {PreviewBackend} previewBackend
 * @param {AttributesBackend} attributesBackend
 * @param {SurrogateKeysCache} surrogateKeysCache
 * @param {UserLimitsApi} userLimitsApi
 * @param {LayergroupAffectedTables} layergroupAffectedTables
 * @param {AnalysisBackend} analysisBackend
 * @constructor
 */
function LayergroupController(
    pgConnection,
    mapStore,
    tileBackend,
    previewBackend,
    attributesBackend,
    surrogateKeysCache,
    userLimitsApi,
    layergroupAffectedTablesCache,
    analysisBackend,
    authApi
) {
    this.pgConnection = pgConnection;
    this.mapStore = mapStore;
    this.tileBackend = tileBackend;
    this.previewBackend = previewBackend;
    this.attributesBackend = attributesBackend;
    this.surrogateKeysCache = surrogateKeysCache;
    this.userLimitsApi = userLimitsApi;
    this.layergroupAffectedTablesCache = layergroupAffectedTablesCache;

    this.dataviewBackend = new DataviewBackend(analysisBackend);
    this.analysisStatusBackend = new AnalysisStatusBackend();
    this.authApi = authApi;
}

module.exports = LayergroupController;

LayergroupController.prototype.register = function(app) {

    const tileController = new TileController(
        this.tileBackend,
        this.pgConnection,
        this.mapStore,
        this.userLimitsApi,
        this.layergroupAffectedTablesCache,
        this.authApi,
        this.surrogateKeysCache
    );

    tileController.register(app);

    const attributesController = new AttributesController(
        this.attributesBackend,
        this.pgConnection,
        this.mapStore,
        this.userLimitsApi,
        this.layergroupAffectedTablesCache,
        this.authApi,
        this.surrogateKeysCache
    );

    attributesController.register(app);

    const staticController = new StaticController(
        this.previewBackend,
        this.pgConnection,
        this.mapStore,
        this.userLimitsApi,
        this.layergroupAffectedTablesCache,
        this.authApi,
        this.surrogateKeysCache
    );

    staticController.register(app);

    const dataviewController = new DataviewController(
        this.dataviewBackend,
        this.pgConnection,
        this.mapStore,
        this.userLimitsApi,
        this.layergroupAffectedTablesCache,
        this.authApi,
        this.surrogateKeysCache
    );

    dataviewController.register(app);

    const analysisController = new AnalysisController(
        this.analysisStatusBackend,
        this.pgConnection,
        this.mapStore,
        this.userLimitsApi,
        this.layergroupAffectedTablesCache,
        this.authApi,
        this.surrogateKeysCache
    );

    analysisController.register(app);
};
