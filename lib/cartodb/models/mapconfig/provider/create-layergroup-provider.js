var assert = require('assert');
var step = require('step');

var MapStoreMapConfigProvider = require('./map-store-provider');
const QueryTables = require('cartodb-query-tables');

/**
 * @param {MapConfig} mapConfig
 * @param {String} user
 * @param {UserLimitsBackend} userLimitsBackend
 * @param {Object} params
 * @constructor
 * @type {CreateLayergroupMapConfigProvider}
 */

function CreateLayergroupMapConfigProvider(
    mapConfig,
    user,
    userLimitsBackend,
    pgConnection,
    affectedTablesCache,
    params
) {
    this.mapConfig = mapConfig;
    this.user = user;
    this.userLimitsBackend = userLimitsBackend;
    this.pgConnection = pgConnection;
    this.affectedTablesCache = affectedTablesCache;
    this.params = params;
    this.cacheBuster = params.cache_buster || 0;
}

module.exports = CreateLayergroupMapConfigProvider;

CreateLayergroupMapConfigProvider.prototype.getMapConfig = function(callback) {
    if (this.mapConfig && this.params && this.context) {
        return callback(null, this.mapConfig, this.params, this.context);
    }

    var context = {};

    this.userLimitsBackend.getRenderLimits(this.user, this.params.api_key, (err, renderLimits) => {
        if (err) {
            return callback(err);
        }

        context.limits = renderLimits;
        this.context = context;

        return callback(err, this.mapConfig, this.params, context);
    });
};

CreateLayergroupMapConfigProvider.prototype.getKey = MapStoreMapConfigProvider.prototype.getKey;

CreateLayergroupMapConfigProvider.prototype.getCacheBuster = MapStoreMapConfigProvider.prototype.getCacheBuster;

CreateLayergroupMapConfigProvider.prototype.filter = MapStoreMapConfigProvider.prototype.filter;

CreateLayergroupMapConfigProvider.prototype.createKey = MapStoreMapConfigProvider.prototype.createKey;

CreateLayergroupMapConfigProvider.prototype.createAffectedTables = function (callback) {
    this.getMapConfig((err, mapConfig) => {
        if (err) {
            return callback(err);
        }

        const { dbname } = this.params;
        const token = mapConfig.id();

        const queries = [];

        this.mapConfig.getLayers().forEach(layer => {
            queries.push(layer.options.sql);
            if (layer.options.affected_tables) {
                layer.options.affected_tables.map(table => {
                    queries.push(`SELECT * FROM ${table} LIMIT 0`);
                });
            }
        });

        const sql = queries.length ? queries.join(';') : null;

        if (!sql) {
            return callback();
        }

        this.pgConnection.getConnection(this.user, (err, connection) => {
            if (err) {
                return callback(err);
            }

            QueryTables.getAffectedTablesFromQuery(connection, sql, (err, affectedTables) => {
                if (err) {
                    return callback(err);
                }

                this.affectedTablesCache.set(dbname, token, affectedTables);

                callback(null, affectedTables);
            });
        });
    });
};

CreateLayergroupMapConfigProvider.prototype.getAffectedTables = function (callback) {
    this.getMapConfig((err, mapConfig) => {
        if (err) {
            return callback(err);
        }

        const { dbname } = this.params;
        const token = mapConfig.id();

        if (this.affectedTablesCache.hasAffectedTables(dbname, token)) {
            const affectedTables = this.affectedTablesCache.get(dbname, token);
            return callback(null, affectedTables);
        }

        return this.createAffectedTables(callback);
    });
};
