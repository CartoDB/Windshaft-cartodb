const FLOAT_OIDS = {
    700: true,
    701: true,
    1700: true
};

const DATE_OIDS = {
    1082: true,
    1114: true,
    1184: true
};

const columnTypeQueryTpl = ctx => `SELECT pg_typeof(${ctx.column})::oid FROM (${ctx.query}) _cdb_column_type limit 1`;

function getPGTypeName (pgType) {
    return {
        float: FLOAT_OIDS.hasOwnProperty(pgType),
        date: DATE_OIDS.hasOwnProperty(pgType)
    };
}

module.exports = class BaseDataview {
    getResult (psql, override, callback) {
        this.sql(psql, override, (err, query) => {
            if (err) {
                return callback(err);
            }

            psql.query(query, (err, result) => {
                if (err) {
                    return callback(err, result);
                }

                result = this.format(result, override);
                result.type = this.getType();

                return callback(null, result);

            }, true); // use read-only transaction
        });
    }

    search (psql, userQuery, callback) {
        return callback(null, this.format({ rows: [] }));
    }

    getColumnType (psql, column, query, callback) {
        const readOnlyTransaction = true;
        const columnTypeQuery = columnTypeQueryTpl({ column, query });

        psql.query(columnTypeQuery, (err, result) => {
            if (err) {
                return callback(err);
            }
            const pgType = result.rows[0].pg_typeof;
            callback(null, getPGTypeName(pgType));
        }, readOnlyTransaction);
    }
};
