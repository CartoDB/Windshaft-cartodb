var assert = require('assert');
var step = require('step');

var MapStoreMapConfigProvider = require('./map-store-provider');
const QueryTables = require('cartodb-query-tables');

/**
 * @param {MapConfig} mapConfig
 * @param {String} user
 * @param {UserLimitsApi} userLimitsApi
 * @param {Object} params
 * @constructor
 * @type {CreateLayergroupMapConfigProvider}
 */

function CreateLayergroupMapConfigProvider(mapConfig, user, userLimitsApi, pgConnection, affectedTablesCache, params) {
    this.mapConfig = mapConfig;
    this.user = user;
    this.userLimitsApi = userLimitsApi;
    this.pgConnection = pgConnection;
    this.affectedTablesCache = affectedTablesCache;
    this.params = params;
    this.cacheBuster = params.cache_buster || 0;
}

module.exports = CreateLayergroupMapConfigProvider;

CreateLayergroupMapConfigProvider.prototype.getMapConfig = function(callback) {
    var self = this;
    var context = {};
    step(
        function prepareContextLimits() {
            self.userLimitsApi.getRenderLimits(self.user, self.params.api_key, this);
        },
        function handleRenderLimits(err, renderLimits) {
            assert.ifError(err);
            context.limits = renderLimits;
            return null;
        },
        function finish(err) {
            return callback(err, self.mapConfig, self.params, context);
        }
    );
};

CreateLayergroupMapConfigProvider.prototype.getKey = MapStoreMapConfigProvider.prototype.getKey;

CreateLayergroupMapConfigProvider.prototype.getCacheBuster = MapStoreMapConfigProvider.prototype.getCacheBuster;

CreateLayergroupMapConfigProvider.prototype.filter = MapStoreMapConfigProvider.prototype.filter;

CreateLayergroupMapConfigProvider.prototype.createKey = MapStoreMapConfigProvider.prototype.createKey;

CreateLayergroupMapConfigProvider.prototype.getAffectedTables = function (callback) {
    var self = this;

    const { dbname } = self.params;
    const token = self.mapConfig.id();

    if (self.affectedTablesCache.hasAffectedTables(dbname, token)) {
        const affectedTables = self.affectedTablesCache.get(dbname, token);
        return callback(null, affectedTables);
    }

    step(
        function getSql() {
            const queries = [];

            self.mapConfig.getLayers().forEach(function(layer) {
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

            return sql;
        },
        function getAffectedTables(err, sql) {
            assert.ifError(err);

            step(
                function getConnection() {
                    self.pgConnection.getConnection(self.user, this);
                },
                function getAffectedTables(err, connection) {
                    assert.ifError(err);
                    QueryTables.getAffectedTablesFromQuery(connection, sql, this);
                },
                this
            );
        },
        function finish(err, affectedTables) {
            if (err) {
                return callback(err);
            }

            self.affectedTablesCache.set(dbname, token, affectedTables);

            return callback(null, affectedTables);
        }
    );
};
