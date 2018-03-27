const cors = require('../../middleware/cors');
const user = require('../../middleware/user');
const layergroupToken = require('../../middleware/layergroup-token');
const cleanUpQueryParams = require('../../middleware/clean-up-query-params');
const credentials = require('../../middleware/credentials');
const dbConnSetup = require('../../middleware/db-conn-setup');
const authorize = require('../../middleware/authorize');
const rateLimit = require('../../middleware/rate-limit');
const { RATE_LIMIT_ENDPOINTS_GROUPS } = rateLimit;
const sendResponse = require('../../middleware/send-response');
const dbParamsFromResLocals = require('../../utils/database-params');

module.exports = class AnalysisController {
    constructor (
        analysisStatusBackend,
        pgConnection,
        mapStore,
        userLimitsApi,
        layergroupAffectedTablesCache,
        authApi,
        surrogateKeysCache
    ) {
        this.analysisStatusBackend = analysisStatusBackend;
        this.pgConnection = pgConnection;
        this.mapStore = mapStore;
        this.userLimitsApi = userLimitsApi;
        this.layergroupAffectedTablesCache = layergroupAffectedTablesCache;
        this.authApi = authApi;
        this.surrogateKeysCache = surrogateKeysCache;
    }

    register (app) {
        const { base_url_mapconfig: mapConfigBasePath } = app;

        app.get(
            `${mapConfigBasePath}/:token/analysis/node/:nodeId`,
            cors(),
            user(),
            layergroupToken(),
            credentials(),
            authorize(this.authApi),
            dbConnSetup(this.pgConnection),
            rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.ANALYSIS),
            cleanUpQueryParams(),
            analysisNodeStatus(this.analysisStatusBackend),
            sendResponse()
        );

    }
};

function analysisNodeStatus (analysisStatusBackend) {
    return function analysisNodeStatusMiddleware(req, res, next) {
        const { nodeId } = req.params;
        const dbParams = dbParamsFromResLocals(res.locals);

        analysisStatusBackend.getNodeStatus(nodeId, dbParams, (err, nodeStatus, stats = {}) => {
            req.profiler.add(stats);

            if (err) {
                err.label = 'GET NODE STATUS';
                return next(err);
            }

            res.set({
                'Cache-Control': 'public,max-age=5',
                'Last-Modified': new Date().toUTCString()
            });

            res.body = nodeStatus;

            next();
        });
    };
}
