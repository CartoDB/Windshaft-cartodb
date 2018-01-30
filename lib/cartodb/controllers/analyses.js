var cors = require('../middleware/cors');
var userMiddleware = require('../middleware/user');
const authMiddleware = require('../middleware/auth');
const dbMiddleware = require('../middleware/db');

function AnalysesController({ prepareContext, pgConnection, metadataBackend }) {
    this.prepareContext = prepareContext;
    this.pgConnection = pgConnection;
    this.metadataBackend = metadataBackend;
}

module.exports = AnalysesController;

AnalysesController.prototype.register = function (app) {
    app.get(
        `${app.base_url_mapconfig}/analyses/catalog`,
        cors(),
        this.prepareContext,
        userMiddleware.initContext(),
        userMiddleware.getUsername(),
        authMiddleware({ metadataBackend: this.metadataBackend }),
        userMiddleware.getMetadata({ metadataBackend: this.metadataBackend }),
        dbMiddleware(),
        this.getDataFromQuery({ queryTemplate: catalogQueryTpl, key: 'catalog' }),
        this.getDataFromQuery({ queryTemplate: tablesQueryTpl, key: 'tables' }),
        this.prepareResponse(),
        this.setCacheControlHeader(),
        this.sendResponse(),
        this.unathorizedError()
    );
};

AnalysesController.prototype.getDataFromQuery = function ({ queryTemplate, key }) {
    const readOnlyTransactionOn = true;

    return function getCatalogMiddleware(req, res, next) {
        const { db: dbConfig, user } = res.locals;
        const sql = queryTemplate({ _username: user });

        const dbConnection = this.pgConnection.getConnection(dbConfig);

        dbConnection.query(sql, (err, resultSet = {}) => {
            if (err) {
                return next(err);
            }

            res.locals[key] = resultSet.rows || [];

            next();
        }, readOnlyTransactionOn);
    }.bind(this);
};

AnalysesController.prototype.prepareResponse = function () {
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
};

AnalysesController.prototype.setCacheControlHeader = function () {
    return function setCacheControlHeaderMiddleware (req, res, next) {
        res.set('Cache-Control', 'public,max-age=10,must-revalidate');
        next();
    };
};

AnalysesController.prototype.sendResponse = function() {
    return function sendResponseMiddleware (req, res) {
        res.status(200);

        if (req.query && req.query.callback) {
            res.jsonp(res.body);
        } else {
            res.json(res.body);
        }
    };
};

AnalysesController.prototype.unathorizedError = function () {
    return function unathorizedErrorMiddleware(err, req, res, next) {
        if (err.message.match(/permission\sdenied/)) {
            err = new Error('Unauthorized');
            err.http_status = 401;
        }

        next(err);
    };
};

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
