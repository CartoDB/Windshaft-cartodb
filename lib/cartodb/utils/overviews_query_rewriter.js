
var TableNameParser = require('./table_name_parser');

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

    regexp = new RegExp(regexp, 'g');

    // the current query transformation approach only supports
    // a single apprearance of the 'table' to be replaced
    var match = sql.match(regexp);
    if ( !match || match.length !== 1 ) {
      return sql;
    }

    // replace all occurrences of the table pattern
    return sql.replace(regexp, replacement);
}

function overviews_query(query, overviews, zoom_level_expression) {
    var replaced_query = query;
    var sql = "WITH\n  _vovw_scale AS ( SELECT " + zoom_level_expression + " AS _vovw_z )";
    var replacement;
    for ( var table in overviews ) {
        if (overviews.hasOwnProperty(table)) {
            var table_overviews = overviews[table];
            var table_view = overviews_view_name(table);
            var schema = table_overviews.schema;
            replacement = "(\n" + overviews_view_for_table(table, table_overviews) + "\n  ) AS " + table_view;
            replaced_query = replace_table_in_query(replaced_query, table, replacement);
            var parsed_table = TableNameParser.parse(table);
            if (!parsed_table.schema && schema) {
                // replace also the qualified table name, if the table wasn't qualified
                parsed_table.schema = schema;
                table = TableNameParser.table_identifier(parsed_table);
                replaced_query = replace_table_in_query(replaced_query, table, replacement);
            }
        }
    }
    if ( replaced_query !== query ) {
        sql += "\n";
        sql += replaced_query;
    } else {
        sql = query;
    }
    return sql;
}

// Transform an SQL query so that it uses overviews.
// overviews contains metadata about the overviews to be used:
//     { 'table-name': {1: { table: 'overview-table-1' }, ... }, ... }
//
// For a given query `SELECT * FROM table`,  if any of tables in it
// has overviews as defined by the provided metadat, the query will
// be transform into something similar to this:
//
//     WITH _vovw_scale AS ( ... ), -- define scale level
//     WITH _vovw_table AS ( ... ), -- define union of overviews and base table
//     SELECT * FROM _vovw_table -- query with table replaced by _vovw_table
//
// This transformation can in principle be applied to arbitrary queries
// (except for the case of queries that include the name of tables with
// overviews inside text literals: at the current table name substitution
// doesnn't prevent substitution inside literals).
// But the transformation will currently only be applied to simple queries
// of the form detected by the overviews_supported_query function.
OverviewsQueryRewriter.prototype.query = function(query, data) {
    var overviews = this.overviews_metadata(data);
    if ( !overviews || !this.is_supported_query(query)) {
        return query;
    }
    var zoom_level_expression = this.options.zoom_level || '0';
    return overviews_query(query, overviews, zoom_level_expression);
};

OverviewsQueryRewriter.prototype.is_supported_query = function(sql) {
    var select_clause = 'SELECT\\s+[\\*a-z0-9_,\\s]+?';
    var from_clause   = 'FROM\\s+((\\"[^"]+\\"|[a-z0-9_]+)\\.)?(\\"[^"]+\\"|[a-z0-9_]+)';
    var where_clause  = 'WHERE.+';
    var basic_query = new RegExp(
      "\\s*" + select_clause + "\\s+" + from_clause +
      "(\\s+"+ where_clause +")?" + "\\s*;?\s*",
      'i'
    );
    var unwrapped_query = new RegExp("^"+basic_query.source+"$", 'i');
    // queries for named maps are wrapped like this:
    var wrapped_query = new RegExp(
        "^\\s*SELECT\\s+\\*\\s+FROM\\s+\\(" +
        basic_query.source +
        "\\)\\s+AS\\s+wrapped_query\\s+WHERE\\s+\\d+=1\\s*$",
        'i'
    );
    return !!(sql.match(unwrapped_query) || sql.match(wrapped_query));
};

OverviewsQueryRewriter.prototype.overviews_metadata = function(data) {
    return data && data.overviews;
};
