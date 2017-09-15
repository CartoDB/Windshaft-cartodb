var BaseDataview = require('./base');
var debug = require('debug')('windshaft:dataview:formula');

const countInfinitiesQueryTpl = ctx => `
    SELECT count(1) FROM (${ctx._query}) __cdb_formula_infinities
    WHERE ${ctx._column} = 'infinity'::float OR ${ctx._column} = '-infinity'::float
`;

const countNansQueryTpl = ctx => `
    SELECT count(1) FROM (${ctx._query}) __cdb_formula_nans
    WHERE ${ctx._column} = 'NaN'::float
`;

const filterOutSpecialNumericValuesTpl = ctx => `
    WHERE
        ${ctx._column} != 'infinity'::float
    AND
        ${ctx._column} != '-infinity'::float
    AND
        ${ctx._column} != 'NaN'::float
`;

const formulaQueryTpl = ctx => `
    SELECT
        ${ctx._operation}(${ctx._column}) AS result,
        (SELECT count(1) FROM (${ctx._query}) _cdb_formula_nulls WHERE ${ctx._column} IS NULL) AS nulls_count
        ${ctx._isFloatColumn ? `,(${countInfinitiesQueryTpl(ctx)}) AS infinities_count` : ''}
        ${ctx._isFloatColumn ? `,(${countNansQueryTpl(ctx)}) AS nans_count` : ''}
    FROM (${ctx._query}) __cdb_formula
    ${ctx._isFloatColumn && ctx._operation !== 'count' ? `${filterOutSpecialNumericValuesTpl(ctx)}` : ''}
`;

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
function Formula(query, options = {}, queries = {}) {
    if (typeof options.operation !== 'string') {
        throw new Error(`Formula expects 'operation' in dataview options`);
    }

    if (!VALID_OPERATIONS[options.operation]) {
        throw new Error(`Formula does not support '${options.operation}' operation`)
    }

    if (options.operation !== 'count' && typeof options.column !== 'string') {
        throw new Error(`Formula expects 'column' in dataview options`);
    }

    BaseDataview.apply(this);

    this.query = query;
    this.queries = queries;
    this.column = options.column || '1';
    this.operation = options.operation;
    this._isFloatColumn = null;
}

Formula.prototype = new BaseDataview();
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
