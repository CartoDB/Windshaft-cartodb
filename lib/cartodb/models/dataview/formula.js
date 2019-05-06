'use strict';

const BaseDataview = require('./base');
const debug = require('debug')('windshaft:dataview:formula');
const utils = require('../../utils/query-utils');

const formulaQueryTpl = ctx =>
`SELECT
    ${ctx.operation}(${utils.handleFloatColumn(ctx)}) AS result,
    ${utils.countNULLs(ctx)} AS nulls_count
    ${ctx.isFloatColumn ? `,${utils.countInfinites(ctx)} AS infinities_count,` : ``}
    ${ctx.isFloatColumn ? `${utils.countNaNs(ctx)} AS nans_count` : ``}
FROM (${ctx.query}) __cdb_formula`;

const VALID_OPERATIONS = {
    count: true,
    avg: true,
    sum: true,
    min: true,
    max: true
};

const TYPE = 'formula';

/**
 {
     type: 'formula',
     options: {
         column: 'name',
         operation: 'count' // count, sum, avg
     }
 }
 */
module.exports = class Formula extends BaseDataview {
    constructor (query, options = {}, queries = {}) {
        super();

        this._checkOptions(options);

        this.query = query;
        this.queries = queries;
        this.column = options.column || '1';
        this.operation = options.operation;
        this._isFloatColumn = null;
    }

    _checkOptions (options) {
        if (typeof options.operation !== 'string') {
            throw new Error(`Formula expects 'operation' in dataview options`);
        }

        if (!VALID_OPERATIONS[options.operation]) {
            throw new Error(`Formula does not support '${options.operation}' operation`);
        }

        if (options.operation !== 'count' && typeof options.column !== 'string') {
            throw new Error(`Formula expects 'column' in dataview options`);
        }
    }


    sql (psql, override, callback) {
        if (!callback) {
            callback = override;
            override = {};
        }

        if (this._isFloatColumn === null) {
            this._isFloatColumn = false;
            this.getColumnType(psql, this.column, this.queries.no_filters, (err, type) => {
                if (!err && !!type) {
                    this._isFloatColumn = type.float;
                }
                this.sql(psql, override, callback);
            });
            return null;
        }

        const formulaSql = formulaQueryTpl({
            isFloatColumn: this._isFloatColumn,
            query: this.query,
            operation: this.operation,
            column: this.column
        });

        debug(formulaSql);

        return callback(null, formulaSql);
    }

    format (res) {
        const {
            result = 0,
            nulls_count = 0,
            nans_count,
            infinities_count
        } = res.rows[0] || {};

        return {
            operation: this.operation,
            result,
            nulls: nulls_count,
            nans: nans_count,
            infinities: infinities_count
        };
    }

    getType () {
        return TYPE;
    }

    toString () {
        return JSON.stringify({
            _type: TYPE,
            _query: this.query,
            _column: this.column,
            _operation: this.operation
        });
    }
};
