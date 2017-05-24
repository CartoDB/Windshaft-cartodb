'use strict';

function DatasourceRegistry() {
    this.datasources = {};
}

module.exports = DatasourceRegistry;

DatasourceRegistry.prototype.add = function(datasource) {
    this.datasources[datasource.id()] = datasource;
};

DatasourceRegistry.prototype.get = function(id) {
    return this.datasources[id];
};
