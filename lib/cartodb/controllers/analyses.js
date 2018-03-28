const PSQL = require('cartodb-psql');
const cleanUpQueryParams = require('../middleware/clean-up-query-params');
const credentials = require('../middleware/credentials');
const authorize = require('../middleware/authorize');
const dbConnSetup = require('../middleware/db-conn-setup');
const rateLimit = require('../middleware/rate-limit');
const { RATE_LIMIT_ENDPOINTS_GROUPS } = rateLimit;
const cacheControlHeader = require('../middleware/cache-control-header');
const sendResponse = require('../middleware/send-response');
const dbParamsFromResLocals = require('../utils/database-params');

function AnalysesController(pgConnection, authApi, userLimitsApi) {
    this.pgConnection = pgConnection;
    this.authApi = authApi;
    this.userLimitsApi = userLimitsApi;
}

module.exports = AnalysesController;

AnalysesController.prototype.register = function (mapRouter) {
    mapRouter.get(
        `/analyses/catalog`,
        credentials(),
        authorize(this.authApi),
        dbConnSetup(this.pgConnection),
        rateLimit(this.userLimitsApi, RATE_LIMIT_ENDPOINTS_GROUPS.ANALYSIS_CATALOG),
        cleanUpQueryParams(),
        createPGClient(),
        getDataFromQuery({ queryTemplate: catalogQueryTpl, key: 'catalog' }),
        getDataFromQuery({ queryTemplate: tablesQueryTpl, key: 'tables' }),
        prepareResponse(),
        cacheControlHeader({ ttl: 10, revalidate: true }),
        sendResponse(),
        unauthorizedError()
    );
};

function createPGClient () {
    return function createPGClientMiddleware (req, res, next) {
        const dbParams = dbParamsFromResLocals(res.locals);

        res.locals.pg = new PSQL(dbParams);

        next();
    };
}

function getDataFromQuery({ queryTemplate, key }) {
    const readOnlyTransactionOn = true;

    return function getCatalogMiddleware(req, res, next) {
        const { pg, user } = res.locals;
        const sql = queryTemplate({ _username: user });

        pg.query(sql, (err, resultSet = {}) => {
            if (err) {
                return next(err);
            }

            res.locals[key] = resultSet.rows || [];

            next();
        }, readOnlyTransactionOn);
    };
}

function prepareResponse () {
    return function prepareResponseMiddleware (req, res, next) {
        const { catalog, tables } = res.locals;

        const analysisIdToTable = tables.reduce((analysisIdToTable, table) => {
            const analysisId = table.relname.split('_')[2];

            if (analysisId && analysisId.length === 40) {
                analysisIdToTable[analysisId] = table;
            }

            return analysisIdToTable;
        }, {});

        const analysisCatalog = catalog.map(analysis => {
            if (analysisIdToTable.hasOwnProperty(analysis.node_id)) {
                analysis.table = analysisIdToTable[analysis.node_id];
            }

            return analysis;
        })
        .sort((analysisA, analysisB) => {
            if (!!analysisA.table && !!analysisB.table) {
                return analysisB.table.size - analysisA.table.size;
            }

            if (!!analysisA.table) {
                return -1;
            }

            if (!!analysisB.table) {
                return 1;
            }

            return -1;
        });

        res.body = { catalog: analysisCatalog };

        next();
    };
}

function unauthorizedError () {
    return function unathorizedErrorMiddleware(err, req, res, next) {
        if (err.message.match(/permission\sdenied/)) {
            err = new Error('Unauthorized');
            err.http_status = 401;
        }

        next(err);
    };
}

const catalogQueryTpl = ctx => `
    SELECT analysis_def->>'type' as type, * FROM cdb_analysis_catalog WHERE username = '${ctx._username}'
`;

var tablesQueryTpl = ctx => `
    WITH analysis_tables AS (
        SELECT
            n.nspname AS nspname,
            c.relname AS relname,
            pg_total_relation_size(
                format('%s.%s', pg_catalog.quote_ident(n.nspname), pg_catalog.quote_ident(c.relname))
            ) AS size,
            format('%s.%s', pg_catalog.quote_ident(nspname), pg_catalog.quote_ident(relname)) AS fully_qualified_name
        FROM pg_catalog.pg_class c, pg_catalog.pg_namespace n
        WHERE c.relnamespace = n.oid
        AND pg_catalog.quote_ident(c.relname) ~ '^analysis_[a-z0-9]{10}_[a-z0-9]{40}$'
        AND n.nspname IN ('${ctx._username}', 'public')
    )
    SELECT *, pg_size_pretty(size) as size_pretty
    FROM analysis_tables
    ORDER BY size DESC
`;
