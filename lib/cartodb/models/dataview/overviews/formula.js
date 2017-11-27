var BaseOverviewsDataview = require('./base');
var BaseDataview = require('../formula');
var debug = require('debug')('windshaft:widget:formula:overview');

var dot = require('dot');
dot.templateSettings.strip = false;

var formulaQueryTpls = {
/* jshint ignore:start */
    'count': dot.template([
        'SELECT',
        'sum(_feature_count) AS result,',
        'sum(CASE WHEN {{=it._column}} IS null THEN 1 ELSE 0 END) AS nulls_count',
        '{{?it._isFloatColumn}}, sum(CASE WHEN {{=it._column}} = \'infinity\'::float OR {{=it._column}} = \'-infinity\'::float THEN 1 ELSE 0 END) AS infinities_count{{?}}',
        '{{?it._isFloatColumn}}, sum(CASE WHEN {{=it._column}} = \'NaN\'::float THEN 1 ELSE 0 END) AS nans_count{{?}}',
        'FROM ({{=it._query}}) _cdb_formula'
    ].join('\n')),
    'sum': dot.template([
        'SELECT',
        'sum(nullif(nullif(nullif({{=it._column}}, \'infinity\'::float), \'-infinity\'::float), \'NaN\'::float)*_feature_count) AS result,',
        'sum(CASE WHEN {{=it._column}} IS null THEN 1 ELSE 0 END) AS nulls_count',
        '{{?it._isFloatColumn}}, sum(CASE WHEN {{=it._column}} = \'infinity\'::float OR {{=it._column}} = \'-infinity\'::float THEN 1 ELSE 0 END) AS infinities_count{{?}}',
        '{{?it._isFloatColumn}}, sum(CASE WHEN {{=it._column}} = \'NaN\'::float THEN 1 ELSE 0 END) AS nans_count{{?}}',
        'FROM ({{=it._query}}) _cdb_formula'
    ].join('\n')),
    'avg': dot.template([
        'SELECT',
        'sum(nullif(nullif(nullif({{=it._column}}, \'infinity\'::float), \'-infinity\'::float), \'NaN\'::float)*_feature_count)/sum(_feature_count) AS result,',
        'sum(CASE WHEN {{=it._column}} IS null THEN 1 ELSE 0 END) AS nulls_count',
        '{{?it._isFloatColumn}}, sum(CASE WHEN {{=it._column}} = \'infinity\'::float OR {{=it._column}} = \'-infinity\'::float THEN 1 ELSE 0 END) AS infinities_count{{?}}',
        '{{?it._isFloatColumn}}, sum(CASE WHEN {{=it._column}} = \'NaN\'::float THEN 1 ELSE 0 END) AS nans_count{{?}}',
        'FROM ({{=it._query}}) _cdb_formula'
    ].join('\n')),
/* jshint ignore:end */
};


function Formula(query, options, queryRewriter, queryRewriteData, params, queries) {
    BaseOverviewsDataview.call(this, query, options, BaseDataview, queryRewriter, queryRewriteData, params, queries);
    this.column = options.column || '1';
    this.operation = options.operation;
    this._isFloatColumn = null;
    this.queries = queries;
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
            this.getColumnType(psql, this.column, this.queries.no_filters, function (err, type) {
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
