'use strict';

const layergroupToken = require('../middlewares/layergroup-token');
const cleanUpQueryParams = require('../middlewares/clean-up-query-params');
const credentials = require('../middlewares/credentials');
const dbConnSetup = require('../middlewares/db-conn-setup');
const authorize = require('../middlewares/authorize');
const rateLimit = require('../middlewares/rate-limit');
const { RATE_LIMIT_ENDPOINTS_GROUPS } = rateLimit;
const dbParamsFromResLocals = require('../../utils/database-params');

module.exports = class AnalysisLayergroupController {
    constructor (analysisStatusBackend, pgConnection, userLimitsBackend, authBackend) {
        this.analysisStatusBackend = analysisStatusBackend;
        this.pgConnection = pgConnection;
        this.userLimitsBackend = userLimitsBackend;
        this.authBackend = authBackend;
    }

    route (mapRouter) {
        mapRouter.get('/:token/analysis/node/:nodeId', this.middlewares());
    }

    middlewares () {
        return [
            layergroupToken(),
            credentials(),
            authorize(this.authBackend),
            dbConnSetup(this.pgConnection),
            rateLimit(this.userLimitsBackend, RATE_LIMIT_ENDPOINTS_GROUPS.ANALYSIS),
            cleanUpQueryParams(),
            analysisNodeStatus(this.analysisStatusBackend)
        ];
    }
};

function analysisNodeStatus (analysisStatusBackend) {
    return function analysisNodeStatusMiddleware (req, res, next) {
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

            res.statusCode = 200;
            res.body = nodeStatus;

            next();
        });
    };
}
