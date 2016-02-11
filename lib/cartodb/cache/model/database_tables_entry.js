var crypto = require('crypto');

function DatabaseTables(tables) {
    this.namespace = 't';
    this.tables = tables;
}

module.exports = DatabaseTables;


DatabaseTables.prototype.key = function() {
    return this.tables.map(function(table) {
        return this.namespace + ':' + shortHashKey(table.dbname + ':' + table.table_name + '.' + table.schema_name);
    }.bind(this));
};

DatabaseTables.prototype.getCacheChannel = function() {
    var key = this.tables.map(function(table) {
        return table.dbname + ':' + table.schema_name + "." + table.table_name;
    }).join(";;");
    return key;
};

function shortHashKey(target) {
    return crypto.createHash('sha256').update(target).digest('base64').substring(0,6);
}
