'use strict';

var Datasource = require('./base');

function PostgreSQLDatasource(psql, layerSql, layerId) {
    Datasource.apply(this);

    this.psql = psql;
    this.layerSql = layerSql;
    this.layerId = layerId;
}
PostgreSQLDatasource.prototype = new Datasource();
PostgreSQLDatasource.prototype.constructor = PostgreSQLDatasource;

module.exports = PostgreSQLDatasource;

PostgreSQLDatasource.prototype.id = function() {
    return this.layerId;
};
PostgreSQLDatasource.prototype.getQuery = function(/*applyFilters*/) {
    return this.layerSql;
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

