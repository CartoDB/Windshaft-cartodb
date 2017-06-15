var dot = require('dot');
dot.templateSettings.strip = false;

function BaseDataview() {}

module.exports = BaseDataview;

BaseDataview.prototype.getResult = function(psql, override, callback) {
    var self = this;
    this.sql(psql, override, function(err, query) {
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
    701: true
};

var columnTypeQueryTpl = dot.template(
    'SELECT pg_typeof({{=it.column}})::oid FROM ({{=it.query}}) _cdb_column_type limit 1'
);

BaseDataview.prototype.getColumnType = function (psql, column, query, callback) {
    var readOnlyTransaction = true;

    var columnTypeQuery = columnTypeQueryTpl({
        column: column, query: query
    });

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
        float: FLOAT_OIDS.hasOwnProperty(pgType)
    };
}
