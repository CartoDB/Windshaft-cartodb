function LayergroupAffectedTables() {
    // layergroupId -> affected tables cache
    this.cache = {};
}

module.exports = LayergroupAffectedTables;

LayergroupAffectedTables.prototype.hasAffectedTables = function(dbName, layergroupId) {
    return this.cache.hasOwnProperty(createKey(dbName, layergroupId));
};

LayergroupAffectedTables.prototype.set = function(dbName, layergroupId, affectedTables) {
    this.cache[createKey(dbName, layergroupId)] = affectedTables;
};

LayergroupAffectedTables.prototype.get = function(dbName, layergroupId) {
    return this.cache[createKey(dbName, layergroupId)];
};

function createKey(dbName, layergroupId) {
    return dbName + ':' + layergroupId;
}
