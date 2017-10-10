var step = require('step');
var assert = require('assert');
var dot = require('dot');
dot.templateSettings.strip = false;
var PSQL = require('cartodb-psql');

var util = require('util');
var BaseController = require('./base');

var cors = require('../middleware/cors');
var userMiddleware = require('../middleware/user');


function AnalysesController(prepareContext) {
    BaseController.call(this);
    this.prepareContext = prepareContext;
}

util.inherits(AnalysesController, BaseController);

module.exports = AnalysesController;

AnalysesController.prototype.register = function(app) {
    app.get(
        app.base_url_mapconfig + '/analyses/catalog',
        cors(),
        userMiddleware,
        this.prepareContext,
        this.catalog.bind(this)
    );
};

AnalysesController.prototype.sendResponse = function(req, res, resource) {
    res.set('Cache-Control', 'public,max-age=10,must-revalidate');
    this.send(req, res, resource, 200);
};

AnalysesController.prototype.catalog = function (req, res, next) {
    var self = this;
    var username = res.locals.user;

    step(
        function catalogQuery() {
            var pg = new PSQL(dbParamsFromReqParams(res.locals));
            getMetadata(username, pg, this);
        },
        function prepareResponse(err, results) {
            assert.ifError(err);

            var analysisIdToTable = results.tables.reduce(function(analysisIdToTable, table) {
                var analysisId = table.relname.split('_')[2];
                if (analysisId && analysisId.length === 40) {
                    analysisIdToTable[analysisId] = table;
                }
                return analysisIdToTable;
            }, {});

            var catalogWithTables = results.catalog.map(function(analysis) {
                if (analysisIdToTable.hasOwnProperty(analysis.node_id)) {
                    analysis.table = analysisIdToTable[analysis.node_id];
                }
                return analysis;
            });

            return catalogWithTables.sort(function(analysisA, analysisB) {
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
        },
        function sendResponse(err, catalogWithTables) {
            if (err) {
                if (err.message.match(/permission\sdenied/)) {
                    err = new Error('Unauthorized');
                    err.http_status = 401;
                }

                next(req, res, err);
            } else {
                self.sendResponse(req, res, { catalog: catalogWithTables });
            }
        }
    );
};

var catalogQueryTpl = dot.template(
    'SELECT analysis_def->>\'type\' as type, * FROM cartodb.cdb_analysis_catalog WHERE username = \'{{=it._username}}\''
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
