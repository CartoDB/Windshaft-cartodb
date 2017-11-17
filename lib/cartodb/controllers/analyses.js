var step = require('step');
var assert = require('assert');
var dot = require('dot');
dot.templateSettings.strip = false;
var PSQL = require('cartodb-psql');
var cors = require('../middleware/cors');
var userMiddleware = require('../middleware/user');

function AnalysesController(prepareContext) {
    this.prepareContext = prepareContext;
}

module.exports = AnalysesController;

AnalysesController.prototype.register = function(app) {
    app.get(
        app.base_url_mapconfig + '/analyses/catalog',
        cors(),
        userMiddleware,
        this.prepareContext,
        this.catalog(),
        this.prepareResponse(),
        this.setCacheControlHeader(),
        this.sendResponse()
    );
};

AnalysesController.prototype.catalog = function () {
    return function catalogMiddleware(req, res, next) {
        const { user } = res.locals;
        const pg = new PSQL(dbParamsFromReqParams(res.locals));

        getMetadata(user, pg, (err, catalogWithTables) => {
            if (err) {
                if (err.message.match(/permission\sdenied/)) {
                    err = new Error('Unauthorized');
                    err.http_status = 401;
                }

                return next(err);
            }

            res.locals.catalogWithTables = catalogWithTables;
            next();
        });
    };
};

AnalysesController.prototype.prepareResponse = function () {
    return function prepareResponseMiddleware (req, res, next) {
        const { catalogWithTables } = res.locals;

        const analysisIdToTable = catalogWithTables.tables.reduce((analysisIdToTable, table) => {
            const analysisId = table.relname.split('_')[2];
            if (analysisId && analysisId.length === 40) {
                analysisIdToTable[analysisId] = table;
            }
            return analysisIdToTable;
        }, {});

        const catalog = catalogWithTables.catalog.map(analysis => {
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

        res.body = { catalog };
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

var catalogQueryTpl = dot.template(
    'SELECT analysis_def->>\'type\' as type, * FROM cdb_analysis_catalog WHERE username = \'{{=it._username}}\''
);

var tablesQueryTpl = dot.template([
    "WITH analysis_tables AS (",
    "    SELECT",
    "        n.nspname AS nspname,",
    "        c.relname AS relname,",
    "        pg_total_relation_size(",
    "            format('%s.%s', pg_catalog.quote_ident(n.nspname), pg_catalog.quote_ident(c.relname))",
    "        ) AS size,",
    "        format('%s.%s', pg_catalog.quote_ident(nspname), pg_catalog.quote_ident(relname)) AS fully_qualified_name",
    "    FROM pg_catalog.pg_class c, pg_catalog.pg_namespace n",
    "    WHERE c.relnamespace = n.oid",
    "    AND pg_catalog.quote_ident(c.relname) ~ '^analysis_[a-z0-9]{10}_[a-z0-9]{40}$'",
    "    AND n.nspname IN ('{{=it._username}}', 'public')",
    ")",
    "SELECT *, pg_size_pretty(size) as size_pretty",
    "FROM analysis_tables",
    "ORDER BY size DESC"
].join('\n'));


function getMetadata(username, pg, callback) {
    var results = {
        catalog: [],
        tables: []
    };
    step(
        function getCatalog() {
            pg.query(catalogQueryTpl({_username: username}), this, true); // use read-only transaction
        },
        function handleCatalog(err, resultSet) {
            assert.ifError(err);
            resultSet = resultSet || {};
            results.catalog = resultSet.rows || [];
            this();
        },
        function getTables(err) {
            assert.ifError(err);
            pg.query(tablesQueryTpl({_username: username}), this, true); // use read-only transaction
        },
        function handleTables(err, resultSet) {
            assert.ifError(err);
            resultSet = resultSet || {};
            results.tables = resultSet.rows || [];
            this();
        },
        function finish(err) {
            if (err) {
                return callback(err);
            }

            return callback(null, results);
        }
    );
}


function dbParamsFromReqParams(params) {
    var dbParams = {};
    if ( params.dbuser ) {
        dbParams.user = params.dbuser;
    }
    if ( params.dbpassword ) {
        dbParams.pass = params.dbpassword;
    }
    if ( params.dbhost ) {
        dbParams.host = params.dbhost;
    }
    if ( params.dbport ) {
        dbParams.port = params.dbport;
    }
    if ( params.dbname ) {
        dbParams.dbname = params.dbname;
    }
    return dbParams;
}
