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
