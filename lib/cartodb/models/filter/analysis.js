var filters = {
    category: require('./analysis/category'),
    range: require('./analysis/range')
};

function createFilter(filterDefinition) {
    var filterType = filterDefinition.type.toLowerCase();
    if (!filters.hasOwnProperty(filterType)) {
        throw new Error('Unknown filter type: ' + filterType);
    }
    return new filters[filterType](filterDefinition.column, filterDefinition.params);
}

function AnalysisFilters(filters) {
    this.filters = filters;
}

AnalysisFilters.prototype.sql = function(rawSql) {
  var filters = this.filters || {};
  var applyFilters = {};

  return Object.keys(filters)
      .filter(function(filterName) {
          return applyFilters.hasOwnProperty(filterName) ? applyFilters[filterName] : true;
      })
      .map(function(filterName) {
          var filterDefinition = filters[filterName];
          return createFilter(filterDefinition);
      })
      .reduce(function(sql, filter) {
          return filter.sql(sql);
      }, rawSql);
};

module.exports = AnalysisFilters;
