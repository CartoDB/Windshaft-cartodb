var BaseOverviewsDataview = require('./base');
var BaseDataview = require('../formula');
var debug = require('debug')('windshaft:widget:formula:overview');
const utils = require('../../../utils/query-utils');

var dot = require('dot');
dot.templateSettings.strip = false;

const VALID_OPERATIONS = {
    count: true,
    sum: true,
    avg: true
};

/** Formulae to calculate the end result using _feature_count from the overview table*/
function dataviewResult(ctx) {
    switch (ctx.operation) {
        case 'count':
            return `sum(_feature_count)`;
        case 'sum':
            return `sum(${utils.handleFloatColumn(ctx)}*_feature_count)`;
        case 'avg':
            return `sum(${utils.handleFloatColumn(ctx)}*_feature_count)/sum(_feature_count) `;
    }
    return `${ctx.operation}(${utils.handleFloatColumn(ctx)})`;
}

const formulaQueryTpl = ctx =>
`SELECT
    ${dataviewResult(ctx)} AS result,
    ${utils.countNULLs(ctx)} AS nulls_count
    ${ctx.isFloatColumn ? `,${utils.countInfinites(ctx)} AS infinities_count,` : ``}
    ${ctx.isFloatColumn ? `${utils.countNaNs(ctx)} AS nans_count` : ``}
FROM (${ctx.query}) __cdb_formula`;

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
    if (!VALID_OPERATIONS[this.operation]) {
        return this.defaultSql(psql, override, callback);
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
        isFloatColumn: this._isFloatColumn,
        query: this.rewrittenQuery(this.query),
        operation: this.operation,
        column: this.column
    });

    callback = callback || override;

    debug(formulaSql);

    return callback(null, formulaSql);
};
