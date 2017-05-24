'use strict';

var dot = require('dot');
dot.templateSettings.strip = false;

var Datasource = require('./base');

function AnalysisDatasource(node) {
    Datasource.apply(this);
    this.id = function() {
        return node.params.id;
    };

    this.node = node;
}
AnalysisDatasource.prototype = new Datasource();
AnalysisDatasource.prototype.constructor = AnalysisDatasource;

module.exports = AnalysisDatasource;

var SKIP_COLUMNS = {
    'the_geom': true,
    'the_geom_webmercator': true
};

function skipColumns(columnNames) {
    return columnNames
        .filter(function(columnName) { return !SKIP_COLUMNS[columnName]; });
}

var wrappedQueryTpl = dot.template([
    'SELECT {{=it._columns}}',
    'FROM ({{=it._query}}) _cdb_analysis_query'
].join('\n'));

function getAllAffectedTablesFromSourceNodes(node) {
    var affectedTables = node.getAllInputNodes(function (node) {
        return node.getType() === 'source';
    }).reduce(function(list, node) {
        return list.concat(node.getAffectedTables());
    },[]);
    return affectedTables;
}

AnalysisDatasource.prototype.getQuery = function(filters) {
    if (this.node.type === 'source') {
        return this.node.getQuery(filters);
    }
    var _columns = ['ST_Transform(the_geom, 3857) the_geom_webmercator'].concat(skipColumns(this.node.getColumns()));
    return wrappedQueryTpl({ _query: this.node.getQuery(filters), _columns: _columns.join(', ') });
};

AnalysisDatasource.prototype.getAffectedTables = function() {
    return getAllAffectedTablesFromSourceNodes(this.node);
};

AnalysisDatasource.prototype.getFilters = function() {
    return this.node.getFilters();
};

AnalysisDatasource.prototype.getType = function() {
    return this.node.getType();
};

AnalysisDatasource.prototype.getMetadata = function() {
    return {};
};

