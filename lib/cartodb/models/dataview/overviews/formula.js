var _ = require('underscore');
var BaseWidget = require('../base');
var BaseDataview = require('../formula');

var debug = require('debug')('windshaft:widget:formula:overviews');

var dot = require('dot');
dot.templateSettings.strip = false;

var formulaQueryTpls = {
  'count': dot.template([
      'SELECT',
      'sum(_feature_count) AS result,',
      '(SELECT count(1) FROM ({{=it._query}}) _cdb_formula_nulls WHERE {{=it._column}} IS NULL) AS nulls_count',
      'FROM ({{=it._query}}) _cdb_formula'
  ].join('\n')),
  'sum': dot.template([
      'SELECT',
      'sum({{=it._column}}*_feature_count) AS result,',
      '(SELECT count(1) FROM ({{=it._query}}) _cdb_formula_nulls WHERE {{=it._column}} IS NULL) AS nulls_count',
      'FROM ({{=it._query}}) _cdb_formula'
  ].join('\n')),
  'avg': dot.template([
      'SELECT',
      'sum({{=it._column}}*_feature_count)/sum(_feature_count) AS result,',
      '(SELECT count(1) FROM ({{=it._query}}) _cdb_formula_nulls WHERE {{=it._column}} IS NULL) AS nulls_count',
      'FROM ({{=it._query}}) _cdb_formula'
  ].join('\n')),
};

function Formula(query, options, queryRewriter, queryRewriteData, params) {
    this.base_dataview = new BaseDataview(query, options);
    this.query = query;
    this.column = options.column || '1';
    this.operation = options.operation;
    this.queryRewriter = queryRewriter;
    this.queryRewriteData = queryRewriteData;
    this.options = params;
}

Formula.prototype = new BaseWidget();
Formula.prototype.constructor = Formula;

module.exports = Formula;

var zoom_level_factor = 100.0;

// Compute zoom level so that the the resolution grid size of the
// selected overview is smaller (zoom_level_factor times smaller at least)
// than the bounding box size.
function zoom_level_for_bbox(bbox) {
    var px_per_tile = 256.0;
    var earth_width = 360.0;
    // TODO: now we assume overviews are computed for 1-pixel tolerance;
    // should use extended overviews metadata to compute this properly.
    if ( bbox ) {
      var bbox_values = _.map(bbox.split(','), function(v) { return +v; });
      var w = Math.abs(bbox_values[2]-bbox_values[0]);
      var h = Math.abs(bbox_values[3]-bbox_values[1]);
      var max_dim = Math.min(w, h);

      // Find minimum suitable z
      // note that the QueryRewirter will use the minimum level overview
      // of level >= z if it exists, and otherwise the base table
      var z = Math.ceil(-Math.log(max_dim*px_per_tile/earth_width/zoom_level_factor)/Math.log(2.0));
      return Math.max(z, 0);
    }
    return 0;
}

Formula.prototype.sql = function(psql, filters, override, callback) {
    var _query = this.query;
    var formulaQueryTpl = formulaQueryTpls[this.operation];

    if ( formulaQueryTpl ) {
        // supported formula for use with overviews
        var zoom_level = zoom_level_for_bbox(this.options.bbox);
        _query = this.queryRewriter.query(_query, this.queryRewriteData, { zoom_level: zoom_level });
        var formulaSql = formulaQueryTpl({
            _query: _query,
            _operation: this.operation,
            _column: this.column
        });
        debug(formulaSql);
        callback = callback || override;

        return callback(null, formulaSql);
    }

    // For non supported operations (min, max) we're not using overviews.
    return this.base_dataview.sql(psql, filters, override, callback);
};

Formula.prototype.format = function(result) {
    return this.base_dataview.format(result);
};

Formula.prototype.getType = function() {
    return this.base_dataview.getType();
};

Formula.prototype.toString = function() {
    return this.base_dataview.toString();
};
