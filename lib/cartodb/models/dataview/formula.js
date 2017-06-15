var _ = require('underscore');
var BaseWidget = require('./base');
var debug = require('debug')('windshaft:widget:formula');

var dot = require('dot');
dot.templateSettings.strip = false;

var formulaQueryTpl = dot.template([
    'SELECT',
    '  {{=it._operation}}({{=it._column}}) AS result,',
    '  (SELECT count(1) FROM ({{=it._query}}) _cdb_formula_nulls WHERE {{=it._column}} IS NULL) AS nulls_count',
    '  {{?it._isFloatColumn}},(SELECT count(1) FROM ({{=it._query}}) _cdb_formula_nulls',
    '      WHERE {{=it._column}} = \'infinity\'::float OR {{=it._column}} = \'-infinity\'::float) AS infinities_count',
    '  ,(SELECT count(1) FROM ({{=it._query}}) _cdb_formula_nulls',
    '      WHERE {{=it._column}} = \'NaN\'::float) AS nans_count{{?}}',
    'FROM ({{=it._query}}) _cdb_formula',
    '{{?it._isFloatColumn}}WHERE',
    '  {{=it._column}} != \'infinity\'::float',
    'AND',
    '  {{=it._column}} != \'-infinity\'::float',
    'AND',
    '  {{=it._column}} != \'NaN\'::float{{?}}'
].join('\n'));

var VALID_OPERATIONS = {
    count: true,
    avg: true,
    sum: true,
    min: true,
    max: true
};

var TYPE = 'formula';

/**
 {
     type: 'formula',
     options: {
         column: 'name',
         operation: 'count' // count, sum, avg
     }
 }
 */
function Formula(query, options) {
    if (!_.isString(options.operation)) {
        throw new Error('Formula expects `operation` in widget options');
    }

    if (!VALID_OPERATIONS[options.operation]) {
        throw new Error("Formula does not support '" + options.operation + "' operation");
    }

    if (options.operation !== 'count' && !_.isString(options.column)) {
        throw new Error('Formula expects `column` in widget options');
    }

    BaseWidget.apply(this);

    this.query = query;
    this.column = options.column || '1';
    this.operation = options.operation;
    this._isFloatColumn = null;
}

Formula.prototype = new BaseWidget();
Formula.prototype.constructor = Formula;

module.exports = Formula;

Formula.prototype.sql = function(psql, override, callback) {
    var self = this;

    if (!callback) {
        callback = override;
        override = {};
    }

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
        _query: this.query,
        _operation: this.operation,
        _column: this.column
    });

    debug(formulaSql);

    return callback(null, formulaSql);
};

Formula.prototype.format = function(result) {
    var formattedResult = {
        operation: this.operation,
        result: 0,
        nulls: 0,
        nans: 0,
        infinities: 0
    };

    if (result.rows.length) {
        formattedResult.operation = this.operation;
        formattedResult.result = result.rows[0].result;
        formattedResult.nulls = result.rows[0].nulls_count;
        formattedResult.nans = result.rows[0].nans_count;
        formattedResult.infinities = result.rows[0].infinities_count;
    }

    return formattedResult;
};

Formula.prototype.getType = function() {
    return TYPE;
};

Formula.prototype.toString = function() {
    return JSON.stringify({
        _type: TYPE,
        _query: this.query,
        _column: this.column,
        _operation: this.operation
    });
};
