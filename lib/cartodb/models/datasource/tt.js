var debug = require('debug')('windshaft:datasources');
var dot = require('dot');
dot.templateSettings.strip = false;

var Datasource = require('./base');

var queryTemplate = dot.template([
    'SELECT * FROM TT_TileData(',
    '  \'{{=it.table}}\',',
    '  \'@bbox\'::json,',
    '  ARRAY[{{=it.filters}}]::json[],',
    '  ARRAY[{{=it.aggregations}}]::json[],',
    '  @zoom',
    ') AS tiledata (',
    '  cartodb_id int,',
    '  the_geom_webmercator geometry{{? it.aggregationsColumns.length > 0 }},{{?}}',
    '  {{=it.aggregationsColumns}}',
    ')'
].join('\n'));

// Example of the query we want to generate:
// SELECT * FROM TT_TileData(
//   'tttable',
//   '{"minx": -20037508.3, "minx": 20037508.29613578, "maxx": -20037508.29613578, "maxy": 20037508.3,3857 }',
//   ARRAY['{"type":"category", "column":"value3", "accept":["xx"]}']::json[],
//   ARRAY['{"aggregate_function":"sum", "aggregate_column":"value1", "type":"numeric"}',
//         '{"aggregate_function":"avg", "aggregate_column":"value2", "type":"numeric"}' ]::json[],
//   10 -- zoom
// ) AS tiledata(
//   cartodb_id int,
//   the_geom_webmercator geometry,
//   value1 numeric,
//   value2 numeric
// );

function TTDatasource(psql, datasource, dataviews, requestFilters) {
    Datasource.apply(this);
    this.id = function() {
        return datasource.id();
    };

    this.psql = psql;
    this.datasource = datasource;
    this.dataviews = dataviews;
    this.sourceId = datasource.id();
    this.requestFilters = requestFilters;

    this.metadata = null;
}
TTDatasource.prototype = new Datasource();
TTDatasource.prototype.constructor = TTDatasource;

module.exports = TTDatasource;

var TT_NAME_REGEX = /(tt_.*)$/i;
TTDatasource.shouldAdapt = function(query) {
    var matches = query && query.match(TT_NAME_REGEX);
    return !!matches;
};

TTDatasource.prototype.getTTName = function() {
    var query = this.datasource.getQuery(false);
    var matches = query && query.match(TT_NAME_REGEX);
    return matches && matches[0];
};

var DATAVIEW_TYPE_2_FILTER_TYPE = {
    aggregation: 'category',
    histogram: 'range'
};

function pgJson(obj) {
    return '\'' + JSON.stringify(obj) + '\'';
}


TTDatasource.prototype.getQuery = function(filters) {
    var metadata = this.getMetadata();
    if (!metadata.hasOwnProperty('table')) {
        return this.datasource.getQuery(filters);
    }
    return queryTemplate({
        table: metadata.table,
        filters: metadata.filters.map(pgJson).join(','),
        aggregations: metadata.aggregations.map(pgJson).join(','),
        aggregationsColumns: metadata.aggregations.map(function(agg) {
            var columnName = agg.aggregate_function === 'count' ?
                'count_vals' : (agg.aggregate_function + agg.aggregate_column);
            return  columnName + ' numeric';
        })
    });
};

TTDatasource.prototype.getAffectedTables = function() {
    return [];
};

TTDatasource.prototype.getFilters = function() {
    return {};
};

TTDatasource.prototype.getType = function() {
    return 'tt';
};

TTDatasource.prototype.getMetadata = function() {
    if (this.metadata !== null) {
        return this.metadata;
    }

    var self = this;

    var ttName = this.getTTName();
    var metadata = {};

    if (ttName) {
        debug('n', ttName);
        debug('s', this.sourceId);
        debug('d', this.dataviews);
        debug('f', this.requestFilters);

        var relatedDataviewKeys = Object.keys(this.dataviews).filter(function(dataviewKey) {
            return self.dataviews[dataviewKey].source.id === self.sourceId;
        });
        var filters = relatedDataviewKeys.reduce(function(filters, relatedDataviewKey) {
            if (self.requestFilters.dataviews.hasOwnProperty(relatedDataviewKey)) {
                var dataview = self.dataviews[relatedDataviewKey];
                var filter = self.requestFilters.dataviews[relatedDataviewKey];
                var relatedFilter = JSON.parse(JSON.stringify(filter));
                relatedFilter.type = DATAVIEW_TYPE_2_FILTER_TYPE[dataview.type];
                relatedFilter.column = dataview.options.column;
                filters.push(relatedFilter);
            }
            return filters;
        }, []);

        metadata = {
            table: ttName,
            filters: filters,
            aggregations: [
                // let's return the basic aggregation
                {
                    aggregate_function: 'count',
                    aggregate_column: 'cartodb_id',
                    type: 'numeric'
                }
            ]
        };
    }

    this.metadata = metadata;

    return metadata;
};
