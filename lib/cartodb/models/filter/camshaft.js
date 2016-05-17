// this is meant as a hack for development
// TODO: reproduce here the filter application of Camshaft
var queryBuilder = require('camshaft/lib/filter/query-builder');

function CamshaftFilters(filters) {
    this.filters = filters;
}

CamshaftFilters.prototype.sql = function(rawSql) {
    return queryBuilder.getSQL(rawSql, filters);
};

module.exports = CamshaftFilters;
