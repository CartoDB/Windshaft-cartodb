'use strict';

var Datasource = require('./base');

function PostgreSQLDatasource(sql) {
    Datasource.apply(this, arguments);

    this.sql = sql;
}
PostgreSQLDatasource.prototype = new Datasource();
PostgreSQLDatasource.prototype.constructor = PostgreSQLDatasource;

module.exports = PostgreSQLDatasource;

PostgreSQLDatasource.prototype.getQuery = function(/*applyFilters*/) {
    return this.sql;
};

PostgreSQLDatasource.prototype.getType = function() {
    // we mimic here an analysis source node
    return 'source';
};

PostgreSQLDatasource.prototype.getFilters = function() {
    return {};
};

PostgreSQLDatasource.prototype.getAffectedTables = function() {
    return [];
};

PostgreSQLDatasource.prototype.getMetadata = function() {
    return {};
};

