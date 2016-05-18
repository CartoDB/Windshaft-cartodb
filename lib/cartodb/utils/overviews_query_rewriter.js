var _ = require('underscore');
var TableNameParser = require('./table_name_parser');

var BBoxFilter = require('../models/filter/bbox');
var CamshaftFilter = require('../models/filter/camshaft');

// Minimim number of filtered rows to use overviews
var FILTER_MIN_ROWS = 65536;
// Maximum filtered fraction to not apply overviews
var FILTER_MAX_FRACTION = 0.2;

function apply_filters_to_query(query, filters, bbox_filter) {
    if ( filters && !_.isEmpty(filters)) {
        var camshaftFilter = new CamshaftFilter(filters);
        query = camshaftFilter.sql(query);
    }
    if ( bbox_filter ) {
        var bboxFilter = new BBoxFilter(bbox_filter.options, bbox_filter.params);
        query = bboxFilter.sql(query);
    }
    return query;
}

function OverviewsQueryRewriter(options) {

    this.options = options;
}

module.exports = OverviewsQueryRewriter;

// TODO: some names are introudced in the queries, and the
// '_vovw_' (for vector overviews) is used in them, but no check
// is performed for conflicts with existing identifiers in the query.

// Build UNION expression to replace table, using overviews metadata
// overviews metadata: { 1: 'table_ov1', ... }
// assume table and overview names include schema if necessary and are quoted as needed
function overviews_view_for_table(table, overviews_metadata, indent) {
    var condition, i, len, ov_table, overview_layers, selects, z_hi, z_lo;
    var parsed_table = TableNameParser.parse(table);

    var sorted_overviews = []; // [[1, 'table_ov1'], ...]

    indent = indent || '    ';
    for (var z in overviews_metadata) {
        if (overviews_metadata.hasOwnProperty(z) && z !== 'schema') {
            sorted_overviews.push([z, overviews_metadata[z].table]);
        }
    }
    sorted_overviews.sort(function(a, b){ return a[0]-b[0]; });

    overview_layers = [];
    z_lo = null;
    for (i = 0, len = sorted_overviews.length; i < len; i++) {
        z_hi = parseInt(sorted_overviews[i][0]);
        ov_table = sorted_overviews[i][1];
        overview_layers.push([overview_z_condition(z_lo, z_hi), ov_table]);
        z_lo = z_hi;
    }
    overview_layers.push(["_vovw_z > " + z_lo, table]);

    selects = overview_layers.map(function(condition_table) {
        condition = condition_table[0];
        ov_table = TableNameParser.parse(condition_table[1]);
        ov_table.schema = ov_table.schema || parsed_table.schema;
        var ov_identifier = TableNameParser.table_identifier(ov_table);
        return indent + "SELECT * FROM " + ov_identifier + ", _vovw_scale WHERE " + condition;
    });

    return selects.join("\n"+indent+"UNION ALL\n");
}

function overview_z_condition(z_lo, z_hi) {
    if (z_lo !== null) {
        if (z_lo === z_hi - 1) {
            return "_vovw_z = " + z_hi;
        } else {
            return "_vovw_z > " + z_lo + " AND _vovw_z <= " + z_hi;
        }
    } else {
        if (z_hi === 0) {
            return "_vovw_z = " + z_hi;
        } else {
            return "_vovw_z <= " + z_hi;
        }
    }
}

// name to be used for the view of the table using overviews
function overviews_view_name(table) {
    var parsed_table = TableNameParser.parse(table);
    parsed_table.table = '_vovw_' + parsed_table.table;
    parsed_table.schema = null;
    return TableNameParser.table_identifier(parsed_table);
}

// replace a table name in a query by anoter name
function replace_table_in_query(sql, old_table_name, replacement) {
    var old_table = TableNameParser.parse(old_table_name);
    var old_table_ident = TableNameParser.table_identifier(old_table);

    // regular expression prefix (beginning) to match a table name
    function pattern_prefix(schema, identifier) {
        if ( schema ) {
            // to match a table name including schema prefix
            // name should not be part of another name, so we require
            // to start a at a word boundary
            if ( identifier[0] !== '"' ) {
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
            replacement = '$01'+replacement;
            return '([^\.a-z0-9_]|^)';
        }
    }

    // regular expression suffix (ending) to match a table name
    function pattern_suffix(identifier) {
        // name shouldn't be the prefix of a longer name
        if ( identifier[identifier.length-1] !== '"' ) {
            return '\\b';
        } else {
            return '';
        }
    }

    // regular expression to match a table name
    var regexp = pattern_prefix(old_table.schema, old_table_ident) +
                 old_table_ident +
                 pattern_suffix(old_table_ident);

    // replace all occurrences of the table pattern
    return sql.replace(new RegExp(regexp, 'g'), replacement);
}


function replace_table_in_query_with_schema(query, table, schema, replacement) {
    if ( replacement ) {
        query = replace_table_in_query(query, table, replacement);
        var parsed_table = TableNameParser.parse(table);
        if (!parsed_table.schema && schema) {
            // replace also the qualified table name, if the table wasn't qualified
            parsed_table.schema = schema;
            table = TableNameParser.table_identifier(parsed_table);
            query = replace_table_in_query(query, table, replacement);
        }
    }
    return query;
}

// Build query to use overviews for a variant zoom level (given by a expression to
// be evaluated by the database server)
function overviews_query_with_zoom_expression(query, overviews, zoom_level_expression) {
    var replaced_query = query;
    var sql = "WITH\n  _vovw_scale AS ( SELECT " + zoom_level_expression + " AS _vovw_z )";
    var replacement;
    _.each(Object.keys(overviews), function(table) {
        var table_overviews = overviews[table];
        var table_view = overviews_view_name(table);
        var schema = table_overviews.schema;
        replacement = "(\n" + overviews_view_for_table(table, table_overviews) + "\n  ) AS " + table_view;
        replaced_query = replace_table_in_query_with_schema(replaced_query, table, schema, replacement);
    });
    if ( replaced_query !== query ) {
        sql += "\n";
        sql += replaced_query;
    } else {
        sql = query;
    }
    return sql;
}

// Build query to use overviews for a specific zoom level value
function overviews_query_with_definite_zoom(query, overviews, zoom_level) {
    var replaced_query = query;
    var replacement;
    _.each(Object.keys(overviews), function(table) {
        var table_overviews = overviews[table];
        var schema = table_overviews.schema;
        replacement = overview_table_for_zoom_level(table_overviews, zoom_level);
        replaced_query = replace_table_in_query_with_schema(replaced_query, table, schema, replacement);
    });
    return replaced_query;
}

// Find a suitable overview table for a specific zoom_level
function overview_table_for_zoom_level(table_overviews, zoom_level) {
    var overview_table;
    if ( table_overviews ) {
        overview_table = table_overviews[zoom_level];
        if ( !overview_table ) {
            _.every(Object.keys(table_overviews).sort(function(x,y){ return x-y; }), function(overview_zoom) {
              if ( +overview_zoom > +zoom_level ) {
                  overview_table = table_overviews[overview_zoom];
                  return false;
              } else {
                  return true;
              }
            });
        }
    }
    if ( overview_table ) {
        overview_table = overview_table.table;
    }
    return overview_table;
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
//        zoom_level: ...,       // optional zoom level
//        filters: ...,          // filters definition
//        unfiltered_query: ..., // query without the filters
//        bbox_filter: ...       // bounding-box filter
//    }
OverviewsQueryRewriter.prototype.query = function(query, data, options) {
    options = options || {};
    data    = data || {};

    var overviews        = data.overviews;
    var unfiltered_query = data.unfiltered_query;
    var filters          = data.filters;
    var bbox_filter      = data.bbox_filter;

    if ( !unfiltered_query ) {
        unfiltered_query = query;
    }

    if ( !should_use_overviews(unfiltered_query, data) ) {
        return query;
    }

    var rewritten_query;

    var zoom_level_expression = this.options.zoom_level;
    var zoom_level = zoom_level_for_query(unfiltered_query, zoom_level_expression, options);

    rewritten_query = overviews_query(unfiltered_query, overviews, zoom_level, zoom_level_expression);

    if ( rewritten_query === unfiltered_query ) {
        // could not or didn't need to alter the query
        rewritten_query = query;
    } else {
        rewritten_query = apply_filters_to_query(rewritten_query, filters, bbox_filter);
    }

    return rewritten_query;
};

function zoom_level_for_query(query, zoom_level_expression, options) {
    var zoom_level = null;
    if ( _.has(options, 'zoom_level') ) {
        zoom_level = options.zoom_level || '0';
    }
    if ( zoom_level === null && !zoom_level_expression ) {
        zoom_level = '0';
    }
    return zoom_level;
}

function overviews_query(query, overviews, zoom_level, zoom_level_expression) {
    if ( zoom_level || zoom_level === '0' || zoom_level === 0 ) {
        return overviews_query_with_definite_zoom(query, overviews, zoom_level);
    } else {
        return overviews_query_with_zoom_expression(query, overviews, zoom_level_expression);
    }
}

function should_use_overviews(query, data) {
    data = data || {};
    var use_overviews = data.overviews && is_supported_query(query);
    if ( use_overviews && data.filters && data.filter_stats ) {
        var filtered_rows = data.filter_stats.filtered_rows;
        var unfiltered_rows = data.filter_stats.unfiltered_rows;
        if ( unfiltered_rows && (filtered_rows || filtered_rows === 0) ) {
            use_overviews = filtered_rows >= FILTER_MIN_ROWS ||
                            (filtered_rows/unfiltered_rows) > FILTER_MAX_FRACTION;
        }
    }
    return use_overviews;
}

function is_supported_query(sql) {
    var basic_query =
        /\s*SELECT\s+[\*a-z0-9_,\s]+?\s+FROM\s+((\"[^"]+\"|[a-z0-9_]+)\.)?(\"[^"]+\"|[a-z0-9_]+)\s*;?\s*/i;
    var unwrapped_query = new RegExp("^"+basic_query.source+"$", 'i');
    // queries for named maps are wrapped like this:
    var wrapped_query = new RegExp(
        "^\\s*SELECT\\s+\\*\\s+FROM\\s+\\(" +
        basic_query.source +
        "\\)\\s+AS\\s+wrapped_query\\s+WHERE\\s+\\d+=1\\s*$",
        'i'
    );
    return !!(sql.match(unwrapped_query) || sql.match(wrapped_query));
}
