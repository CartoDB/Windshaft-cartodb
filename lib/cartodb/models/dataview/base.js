function BaseDataview() {}

module.exports = BaseDataview;

BaseDataview.prototype.getResult = function(psql, override, callback) {
    var self = this;
    this.sql(psql, override, function(err, query) {
        if (err) {
            return callback(err);
        }

        psql.query(query, function(err, result) {
            if (err) {
                return callback(err, result);
            }

            result = self.format(result, override);
            result.type = self.getType();

            return callback(null, result);

        }, true); // use read-only transaction
    });

};

BaseDataview.prototype.search = function(psql, userQuery, callback) {
    return callback(null, this.format({ rows: [] }));
};

var FLOAT_OIDS = {
    700: true,
    701: true,
    1700: true
};

var DATE_OIDS = {
    1082: true,
    1114: true,
    1184: true
};

var columnTypeQueryTpl = ctx => `SELECT pg_typeof(${ctx.column})::oid FROM (${ctx.query}) _cdb_column_type limit 1`;

BaseDataview.prototype.getColumnType = function (psql, column, query, callback) {
    var readOnlyTransaction = true;

    var columnTypeQuery = columnTypeQueryTpl({ column, query });

    psql.query(columnTypeQuery, function(err, result) {
        if (err) {
            return callback(err);
        }
        var pgType = result.rows[0].pg_typeof;
        callback(null, getPGTypeName(pgType));
    }, readOnlyTransaction);
};

function getPGTypeName (pgType) {
    return {
        float: FLOAT_OIDS.hasOwnProperty(pgType),
        date: DATE_OIDS.hasOwnProperty(pgType)
    };
}
