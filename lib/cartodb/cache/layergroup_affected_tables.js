var LruCache = require('lru-cache');

function LayergroupAffectedTables() {
    // dbname + layergroupId -> affected tables cache
    this.cache = new LruCache({ max: 2000 });
}

module.exports = LayergroupAffectedTables;

LayergroupAffectedTables.prototype.hasAffectedTables = function(dbName, layergroupId) {
    return this.cache.has(createKey(dbName, layergroupId));
};

LayergroupAffectedTables.prototype.set = function(dbName, layergroupId, affectedTables) {
    this.cache.set(createKey(dbName, layergroupId), affectedTables);
};

LayergroupAffectedTables.prototype.get = function(dbName, layergroupId) {
    return this.cache.get(createKey(dbName, layergroupId));
};

function createKey(dbName, layergroupId) {
    return dbName + ':' + layergroupId;
}
