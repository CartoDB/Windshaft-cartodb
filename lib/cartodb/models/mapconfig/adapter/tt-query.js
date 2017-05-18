var debug = require('debug')('windshaft:tt-query');
var queue = require('queue-async');
var dot = require('dot');
dot.templateSettings.strip = false;

var queryTemplate = dot.template([
    'SELECT * FROM TT_TileData(',
    '  \'{{=it.table}}\',',
    '  \'@bbox\'::json,',
    '  ARRAY[{{=it.filters}}]::json[],',
    '  ARRAY[{{=it.aggregations}}]::json[],',
    '  @zoom',
    ') AS tiledata (',
    '  cartodb_id int,',
    '  the_geom_webmercator geometry{{? it.aggregationsColumns }},{{?}}',
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

function TTQueryMapConfigAdapter() {
}

module.exports = TTQueryMapConfigAdapter;

TTQueryMapConfigAdapter.prototype.getMapConfig = function(user, requestMapConfig, params, context, callback) {
    var self = this;

    if (!Array.isArray(requestMapConfig.layers) || requestMapConfig.layers.length === 0) {
        return callback(null, requestMapConfig);
    }

    var filters = getFilters(params);
    var dataviews = requestMapConfig.dataviews || {};

    function adaptLayer(layer, done) {
        layer.options = layer.options || {};
        self.getTTMetadata(layer, dataviews, filters, function(err, metadata) {
            if (err) {
                return done(err);
            }
            if (metadata) {
                debug(metadata);
                layer.options.sql = queryTemplate({
                    table: metadata.table,
                    filters: metadata.filters.map(pgJson).join(','),
                    aggregations: metadata.aggregations.map(pgJson).join(','),
                    aggregationsColumns: metadata.aggregations.map(function(agg) {
                        var columnName = agg.aggregate_function === 'count' ?
                            'count_vals' : (agg.aggregate_function + agg.aggregate_column);
                        return  columnName + ' numeric';
                    })
                });
                // Let's store all metadata for debugging/testing.
                layer.options.tt = metadata;
            }
            return done(null, layer);
        });
    }

    function layersAdaptQueueFinish(err, layers) {
        if (err) {
            return callback(err);
        }
        requestMapConfig.layers = layers;
        return callback(null, requestMapConfig);
    }

    var adaptLayersQueue = queue(requestMapConfig.layers.length);
    requestMapConfig.layers.forEach(function(layer) {
        adaptLayersQueue.defer(adaptLayer, layer);
    });
    adaptLayersQueue.awaitAll(layersAdaptQueueFinish);
};

var TT_NAME_REGEX = /(tt_.*)$/i;
TTQueryMapConfigAdapter.prototype.getTTName = function(layer, callback) {
    var query = layer.options && layer.options.sql_no_filters && layer.options.sql;
    var matches = query && query.match(TT_NAME_REGEX);
    return callback(null, matches && matches[0]);
};

var DATAVIEW_TYPE_2_FILTER_TYPE = {
    aggregation: 'category',
    histogram: 'range'
};


TTQueryMapConfigAdapter.prototype.getTTMetadata = function(layer, dataviews, requestFilters, callback) {
    this.getTTName(layer, function(err, ttName) {
        if (err) {
            return callback(err);
        }

        if (ttName) {
            debug('q', layer.options.sql_no_filters || layer.options.sql);
            debug('n', ttName);
            debug('s', layer.options.source);
            debug('d', dataviews);
            debug('f', requestFilters);
            var sourceId = layer.options.source && layer.options.source.id;

            if (!sourceId) {
                return callback(new Error('TT Query: Missing Source ID. TT should use a DataSource.'));
            }

            var relatedDataviewKeys = Object.keys(dataviews).filter(function(dataviewKey) {
                return dataviews[dataviewKey].source.id === sourceId;
            });
            var filters = relatedDataviewKeys.reduce(function(filters, relatedDataviewKey) {
                if (requestFilters.dataviews.hasOwnProperty(relatedDataviewKey)) {
                    var dataview = dataviews[relatedDataviewKey];
                    var filter = requestFilters.dataviews[relatedDataviewKey];
                    var relatedFilter = JSON.parse(JSON.stringify(filter));
                    relatedFilter.type = DATAVIEW_TYPE_2_FILTER_TYPE[dataview.type];
                    relatedFilter.column = dataview.options.column;
                    filters.push(relatedFilter);
                }
                return filters;
            }, []);

            var aggregations = relatedDataviewKeys.reduce(function(aggregations, relatedDataviewKey) {
                var dataview = dataviews[relatedDataviewKey];
                if (dataview.type === 'aggregation') {
                    var aggregation = {
                        aggregate_function: dataview.options.aggregation,
                        aggregate_column: dataview.options.aggregation === 'count' ?
                            'cartodb_id' : dataview.options.aggregationColumn,
                        type: 'numeric'
                    };
                    aggregations.push(aggregation);
                }
                return aggregations;
            }, []);

            var metadata = {
                table: ttName,
                filters: filters,
                aggregations: aggregations
            };
            return callback(null, metadata);
        }

        return callback(null, null);
    });
};

function getFilters(params) {
    var filters = {};
    if (params.filters) {
        try {
            filters = JSON.parse(params.filters);
        } catch (e) {
            // ignore
        }
    }
    filters.dataviews = filters.dataviews || {};
    return filters;
}

function pgJson(obj) {
    return '\'' + JSON.stringify(obj) + '\'';
}
