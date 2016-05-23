var BaseOverviewsWidget = require('./base');
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

Formula.prototype = new BaseOverviewsWidget();
Formula.prototype.constructor = Formula;

module.exports = Formula;

Formula.prototype.sql = function(psql, filters, override, callback) {
    var _query = this.query;
    var formulaQueryTpl = formulaQueryTpls[this.operation];

    if ( formulaQueryTpl ) {
        // supported formula for use with overviews
        var zoom_level = this.zoomLevelForBbox(this.options.bbox);
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
