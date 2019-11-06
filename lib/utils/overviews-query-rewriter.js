'use strict';

var _ = require('underscore');
var TableNameParser = require('./table-name-parser');

var BBoxFilter = require('../models/filter/bbox');
var AnalysisFilter = require('../models/filter/analysis');

// Minimim number of filtered rows to use overviews
var FILTER_MIN_ROWS = 65536;
// Maximum filtered fraction to not apply overviews
var FILTER_MAX_FRACTION = 0.2;

function applyFiltersToQuery (query, filters, bboxFilter) {
    if (filters && !_.isEmpty(filters)) {
        var analysisFilter = new AnalysisFilter(filters);
        query = analysisFilter.sql(query);
    }
    if (bboxFilter) {
        var filter = new BBoxFilter(bboxFilter.options, bboxFilter.params);
        query = filter.sql(query);
    }
    return query;
}

function OverviewsQueryRewriter (options) {
    this.options = options;
}

module.exports = OverviewsQueryRewriter;

// TODO: some names are introudced in the queries, and the
// '_vovw_' (for vector overviews) is used in them, but no check
// is performed for conflicts with existing identifiers in the query.

// Build UNION expression to replace table, using overviews metadata
// overviews metadata: { 1: 'table_ov1', ... }
// assume table and overview names include schema if necessary and are quoted as needed
function overviewsViewForTable (table, overviewsMetadata, indent) {
    var condition, i, len, ovTable, overviewLayers, selects, zHi, zLo;
    var parsedTable = TableNameParser.parse(table);

    var sortedOverviews = []; // [[1, 'table_ov1'], ...]

    indent = indent || '    ';
    for (var z in overviewsMetadata) {
        if (Object.prototype.hasOwnProperty.call(overviewsMetadata, z) && z !== 'schema') {
            sortedOverviews.push([z, overviewsMetadata[z].table]);
        }
    }
    sortedOverviews.sort(function (a, b) { return a[0] - b[0]; });

    overviewLayers = [];
    zLo = null;
    for (i = 0, len = sortedOverviews.length; i < len; i++) {
        zHi = parseInt(sortedOverviews[i][0]);
        ovTable = sortedOverviews[i][1];
        overviewLayers.push([overviewZCondition(zLo, zHi), ovTable]);
        zLo = zHi;
    }
    overviewLayers.push(['_vovw_z > ' + zLo, table]);

    selects = overviewLayers.map(function (conditionTable) {
        condition = conditionTable[0];
        ovTable = TableNameParser.parse(conditionTable[1]);
        ovTable.schema = ovTable.schema || parsedTable.schema;
        var ovIdentifier = TableNameParser.table_identifier(ovTable);
        return indent + 'SELECT * FROM ' + ovIdentifier + ', _vovw_scale WHERE ' + condition;
    });

    return selects.join('\n' + indent + 'UNION ALL\n');
}

function overviewZCondition (zLo, zHi) {
    if (zLo !== null) {
        if (zLo === zHi - 1) {
            return '_vovw_z = ' + zHi;
        } else {
            return '_vovw_z > ' + zLo + ' AND _vovw_z <= ' + zHi;
        }
    } else {
        if (zHi === 0) {
            return '_vovw_z = ' + zHi;
        } else {
            return '_vovw_z <= ' + zHi;
        }
    }
}

// name to be used for the view of the table using overviews
function overviewsViewName (table) {
    var parsedTable = TableNameParser.parse(table);
    parsedTable.table = '_vovw_' + parsedTable.table;
    parsedTable.schema = null;
    return TableNameParser.table_identifier(parsedTable);
}

// replace a table name in a query by anoter name
function replaceTableInQuery (sql, oldTableName, replacement) {
    var oldTable = TableNameParser.parse(oldTableName);
    var oldTableIdent = TableNameParser.table_identifier(oldTable);

    // regular expression prefix (beginning) to match a table name
    function patternPrefix (schema, identifier) {
        if (schema) {
            // to match a table name including schema prefix
            // name should not be part of another name, so we require
            // to start a at a word boundary
            if (identifier[0] !== '"') {
                return '\\b';
            } else {
                return '';
            }
        } else {
            // to match a table name without schema
            // name should not begin right after a dot (i.e. have a explicit schema)
            // nor be part of another name
            // since the pattern matches the first character of the table
            // it must be put back in the replacement text
            replacement = '$01' + replacement;
            return '([^\.a-z0-9_]|^)'; // eslint-disable-line no-useless-escape
        }
    }

    // regular expression suffix (ending) to match a table name
    function patternSuffix (identifier) {
        // name shouldn't be the prefix of a longer name
        if (identifier[identifier.length - 1] !== '"') {
            return '\\b';
        } else {
            return '';
        }
    }

    // regular expression to match a table name
    var regexp = patternPrefix(oldTable.schema, oldTableIdent) +
                 oldTableIdent +
                 patternSuffix(oldTableIdent);

    // replace all occurrences of the table pattern
    return sql.replace(new RegExp(regexp, 'g'), replacement);
}

function replaceTableInQueryWithSchema (query, table, schema, replacement) {
    if (replacement) {
        query = replaceTableInQuery(query, table, replacement);
        var parsedTable = TableNameParser.parse(table);
        if (!parsedTable.schema && schema) {
            // replace also the qualified table name, if the table wasn't qualified
            parsedTable.schema = schema;
            table = TableNameParser.table_identifier(parsedTable);
            query = replaceTableInQuery(query, table, replacement);
        }
    }
    return query;
}

// Build query to use overviews for a variant zoom level (given by a expression to
// be evaluated by the database server)
function overviewsQueryWithZoomExpression (query, overviews, zoomLevelExpression) {
    var replacedQuery = query;
    var sql = 'WITH\n  _vovw_scale AS ( SELECT ' + zoomLevelExpression + ' AS _vovw_z )';
    var replacement;
    _.each(Object.keys(overviews), function (table) {
        var tableOverviews = overviews[table];
        var tableView = overviewsViewName(table);
        var schema = tableOverviews.schema;
        replacement = '(\n' + overviewsViewForTable(table, tableOverviews) + '\n  ) AS ' + tableView;
        replacedQuery = replaceTableInQueryWithSchema(replacedQuery, table, schema, replacement);
    });
    if (replacedQuery !== query) {
        sql += '\n';
        sql += replacedQuery;
    } else {
        sql = query;
    }
    return sql;
}

// Build query to use overviews for a specific zoom level value
function overviewsQueryWithDefiniteZoom (query, overviews, zoomLevel) {
    var replacedQuery = query;
    var replacement;
    _.each(Object.keys(overviews), function (table) {
        var tableOverviews = overviews[table];
        var schema = tableOverviews.schema;
        replacement = overviewTableForZoomLevel(tableOverviews, zoomLevel);
        replacedQuery = replaceTableInQueryWithSchema(replacedQuery, table, schema, replacement);
    });
    return replacedQuery;
}

// Find a suitable overview table for a specific zoomLevel
function overviewTableForZoomLevel (tableOverviews, zoomLevel) {
    var overviewTable;
    if (tableOverviews) {
        overviewTable = tableOverviews[zoomLevel];
        if (!overviewTable) {
            _.every(Object.keys(tableOverviews).sort(function (x, y) { return x - y; }), function (overviewZoom) {
                if (+overviewZoom > +zoomLevel) {
                    overviewTable = tableOverviews[overviewZoom];
                    return false;
                } else {
                    return true;
                }
            });
        }
    }
    if (overviewTable) {
        overviewTable = overviewTable.table;
    }
    return overviewTable;
}

// Transform an SQL query so that it uses overviews.
//
// For a given query `SELECT * FROM table`,  if any of tables in it
// has overviews as defined by the provided metadat, the query will
// be transform into something similar to this:
//
//     WITH _vovw_scale AS ( ... ), -- define scale level
//     SELECT * FROM                -- in the query the table is replaced by:
//      ( ... ) AS _vovw_table      -- a union of overviews and base table
//
// The data argument has the form:
//    {
//        overviews:             // overview tables metadata
//             { 'table-name': {1: { table: 'overview-table-1' }, ... }, ... },
//        zoomLevel: ...,       // optional zoom level
//        filters: ...,          // filters definition
//        unfilteredQuery: ..., // query without the filters
//        bboxFilter: ...       // bounding-box filter
//    }
OverviewsQueryRewriter.prototype.query = function (query, data, options) {
    options = options || {};
    data = data || {};

    var overviews = data.overviews;
    var unfilteredQuery = data.unfiltered_query;
    var filters = data.filters;
    var bboxFilter = data.bbox_filter;

    if (!unfilteredQuery) {
        unfilteredQuery = query;
    }

    if (!shouldUseOverviews(unfilteredQuery, data)) {
        return query;
    }

    var rewrittenQuery;

    var zoomLevelExpression = this.options.zoom_level;
    var zoomLevel = zoomLevelForQuery(unfilteredQuery, zoomLevelExpression, options);

    rewrittenQuery = overviewsQuery(unfilteredQuery, overviews, zoomLevel, zoomLevelExpression);

    if (rewrittenQuery === unfilteredQuery) {
        // could not or didn't need to alter the query
        rewrittenQuery = query;
    } else {
        rewrittenQuery = applyFiltersToQuery(rewrittenQuery, filters, bboxFilter);
    }

    return rewrittenQuery;
};

function zoomLevelForQuery (query, zoomLevelExpression, options) {
    var zoomLevel = null;
    if (_.has(options, 'zoom_level')) {
        zoomLevel = options.zoom_level || '0';
    }
    if (zoomLevel === null && !zoomLevelExpression) {
        zoomLevel = '0';
    }
    return zoomLevel;
}

function overviewsQuery (query, overviews, zoomLevel, zoomLevelExpression) {
    if (zoomLevel || zoomLevel === '0' || zoomLevel === 0) {
        return overviewsQueryWithDefiniteZoom(query, overviews, zoomLevel);
    } else {
        return overviewsQueryWithZoomExpression(query, overviews, zoomLevelExpression);
    }
}

function shouldUseOverviews (query, data) {
    data = data || {};
    var useOverviews = data.overviews && isSupportedQuery(query);
    if (useOverviews && data.filters && data.filter_stats) {
        var filteredRows = data.filter_stats.filtered_rows;
        var unfilteredRows = data.filter_stats.unfiltered_rows;
        if (unfilteredRows && (filteredRows || filteredRows === 0)) {
            useOverviews = filteredRows >= FILTER_MIN_ROWS ||
                            (filteredRows / unfilteredRows) > FILTER_MAX_FRACTION;
        }
    }
    return useOverviews;
}

function isSupportedQuery (sql) {
    var basicQuery = /\s*SELECT\s+[\*a-z0-9_,\s]+?\s+FROM\s+((\"[^"]+\"|[a-z0-9_]+)\.)?(\"[^"]+\"|[a-z0-9_]+)\s*;?\s*/i; // eslint-disable-line no-useless-escape
    var unwrappedQuery = new RegExp('^' + basicQuery.source + '$', 'i');
    // queries for named maps are wrapped like this:
    var wrappedQuery = new RegExp(
        '^\\s*SELECT\\s+\\*\\s+FROM\\s+\\(' +
        basicQuery.source +
        '\\)\\s+AS\\s+wrapped_query\\s+WHERE\\s+\\d+=1\\s*$',
        'i'
    );
    return !!(sql.match(unwrappedQuery) || sql.match(wrappedQuery));
}
