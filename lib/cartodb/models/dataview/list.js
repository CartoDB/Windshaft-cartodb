const BaseDataview = require('./base');

const TYPE = 'list';

const listSqlTpl = ctx => `select ${ctx._columns} from (${ctx._query}) as _cdb_list`;

/**
{
    type: 'list',
    options: {
        columns: ['name', 'description']
    }
}
*/
module.exports = class List extends BaseDataview{
    constructor (query, options = {}) {
        super();

        this._checkOptions(options);

        this.query = query;
        this.columns = options.columns;
    }

    _checkOptions (options) {
        if (!Array.isArray(options.columns)) {
            throw new Error('List expects `columns` array in dataview options');
        }
    }

    sql (psql, override, callback) {
        if (!callback) {
            callback = override;
        }

        const listSql = listSqlTpl({
            _query: this.query,
            _columns: this.columns.join(', ')
        });

        return callback(null, listSql);
    }

    format (result) {
        return {
            rows: result.rows
        };
    }

    getType () {
        return TYPE;
    }

    toString () {
        return JSON.stringify({
            _type: TYPE,
            _query: this.query,
            _columns: this.columns.join(', ')
        });
    };
}
