var crypto = require('crypto');

function DatabaseTables(dbName, tableNames) {
    this.namespace = 't';
    this.dbName = dbName;
    this.tableNames = tableNames;
}

module.exports = DatabaseTables;


DatabaseTables.prototype.key = function() {
    return this.tableNames.map(function(tableName) {
        return this.namespace + ':' + shortHashKey(this.dbName + ':' + tableName);
    }.bind(this));
};

function shortHashKey(target) {
    return crypto.createHash('sha256').update(target).digest('base64').substring(0,6);
}
