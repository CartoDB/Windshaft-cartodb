var BaseOverviewsDataview = require('./base');
var BaseDataview = require('../formula');
var debug = require('debug')('windshaft:widget:formula:overview');

var dot = require('dot');
dot.templateSettings.strip = false;

var formulaQueryTpls = {
    'count': dot.template([
        'SELECT',
        'sum(_feature_count) AS result,',
        '(SELECT count(1) FROM ({{=it._query}}) _cdb_formula_nulls WHERE {{=it._column}} IS NULL) AS nulls_count',
        '{{?it._isFloatColumn}},(SELECT count(1) FROM ({{=it._query}}) _cdb_formula_infinities',
        '  WHERE {{=it._column}} = \'infinity\'::float OR {{=it._column}} = \'-infinity\'::float) AS infinities_count,',
        '(SELECT count(1) FROM ({{=it._query}}) _cdb_formula_nans',
        '  WHERE {{=it._column}} = \'NaN\'::float) AS nans_count{{?}}',
        'FROM ({{=it._query}}) _cdb_formula'
    ].join('\n')),
    'sum': dot.template([
        'SELECT',
        'sum({{=it._column}}*_feature_count) AS result,',
        '(SELECT count(1) FROM ({{=it._query}}) _cdb_formula_nulls WHERE {{=it._column}} IS NULL) AS nulls_count',
        '{{?it._isFloatColumn}},(SELECT count(1) FROM ({{=it._query}}) _cdb_formula_infinities',
        '  WHERE {{=it._column}} = \'infinity\'::float OR {{=it._column}} = \'-infinity\'::float) AS infinities_count',
        ',(SELECT count(1) FROM ({{=it._query}}) _cdb_formula_nans',
        '  WHERE {{=it._column}} = \'NaN\'::float) AS nans_count{{?}}',
        'FROM ({{=it._query}}) _cdb_formula',
        '{{?it._isFloatColumn}}WHERE',
        '  {{=it._column}} != \'infinity\'::float',
        'AND',
        '  {{=it._column}} != \'-infinity\'::float',
        'AND',
        '  {{=it._column}} != \'NaN\'::float{{?}}'
    ].join('\n')),
    'avg': dot.template([
        'SELECT',
        'sum({{=it._column}}*_feature_count)/sum(_feature_count) AS result,',
        '(SELECT count(1) FROM ({{=it._query}}) _cdb_formula_nulls WHERE {{=it._column}} IS NULL) AS nulls_count',
        '{{?it._isFloatColumn}},(SELECT count(1) FROM ({{=it._query}}) _cdb_formula_infinities',
        '  WHERE {{=it._column}} = \'infinity\'::float OR {{=it._column}} = \'-infinity\'::float) AS infinities_count',
        ',(SELECT count(1) FROM ({{=it._query}}) _cdb_formula_nans',
        '  WHERE {{=it._column}} = \'NaN\'::float) AS nans_count{{?}}',
        'FROM ({{=it._query}}) _cdb_formula',
        '{{?it._isFloatColumn}}WHERE',
        '  {{=it._column}} != \'infinity\'::float',
        'AND',
        '  {{=it._column}} != \'-infinity\'::float',
        'AND',
        '  {{=it._column}} != \'NaN\'::float{{?}}'
    ].join('\n')),
};

function Formula(query, options, queryRewriter, queryRewriteData, params) {
    BaseOverviewsDataview.call(this, query, options, BaseDataview, queryRewriter, queryRewriteData, params);
    this.column = options.column || '1';
    this.operation = options.operation;
    this._isFloatColumn = null;
}

Formula.prototype = Object.create(BaseOverviewsDataview.prototype);
Formula.prototype.constructor = Formula;

module.exports = Formula;

Formula.prototype.sql = function (psql, override, callback) {
    var self = this;
    var formulaQueryTpl = formulaQueryTpls[this.operation];

    if (formulaQueryTpl) {
        // supported formula for use with overviews
        if (this._isFloatColumn === null) {
            this._isFloatColumn = false;
            this.getColumnType(psql, this.column, this.query, function (err, type) {
                if (!err && !!type) {
                    self._isFloatColumn = type.float;
                }
                self.sql(psql, override, callback);
            });
            return null;
        }

        var formulaSql = formulaQueryTpl({
            _isFloatColumn: this._isFloatColumn,
            _query: this.rewrittenQuery(this.query),
            _operation: this.operation,
            _column: this.column
        });

        callback = callback || override;

        debug(formulaSql);

        return callback(null, formulaSql);
    }


    // default behaviour
    return this.defaultSql(psql, override, callback);
};
