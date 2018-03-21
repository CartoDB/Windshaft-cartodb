var _ = require('underscore');
var assert = require('assert');
var dot = require('dot');
var step = require('step');
const QueryTables = require('cartodb-query-tables');

/**
 * @param {MapStore} mapStore
 * @param {String} user
 * @param {UserLimitsApi} userLimitsApi
 * @param {Object} params
 * @constructor
 * @type {MapStoreMapConfigProvider}
 */
function MapStoreMapConfigProvider(mapStore, user, userLimitsApi, pgConnection, affectedTablesCache, params) {
    this.mapStore = mapStore;
    this.user = user;
    this.userLimitsApi = userLimitsApi;
    this.pgConnection = pgConnection;
    this.affectedTablesCache = affectedTablesCache;
    this.token = params.token;
    this.cacheBuster = params.cache_buster || 0;
    this.mapConfig = null;
    this.params = params;
    this.context = null;
}

module.exports = MapStoreMapConfigProvider;

MapStoreMapConfigProvider.prototype.getMapConfig = function(callback) {
    var self = this;

    if (this.mapConfig !== null) {
        return callback(null, this.mapConfig, this.params, this.context);
    }

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
        function loadMapConfig(err) {
            assert.ifError(err);
            self.mapStore.load(self.token, this);
        },
        function finish(err, mapConfig) {
            self.mapConfig = mapConfig;
            self.context = context;
            return callback(err, mapConfig, self.params, context);
        }
    );
};

MapStoreMapConfigProvider.prototype.getKey = function() {
    return this.createKey(false);
};

MapStoreMapConfigProvider.prototype.getCacheBuster = function() {
    return this.cacheBuster;
};

MapStoreMapConfigProvider.prototype.filter = function(key) {
    var regex = new RegExp('^' + this.createKey(true) + '.*');
    return key && key.match(regex);
};

// Configure bases for cache keys suitable for string interpolation
var baseKey   = '{{=it.dbname}}:{{=it.token}}';
var rendererKey = baseKey + ':{{=it.dbuser}}:{{=it.format}}:{{=it.layer}}:{{=it.scale_factor}}';

var baseKeyTpl = dot.template(baseKey);
var rendererKeyTpl = dot.template(rendererKey);

MapStoreMapConfigProvider.prototype.createKey = function(base) {
    var tplValues = _.defaults({}, this.params, {
        dbname: '',
        token: '',
        dbuser: '',
        format: '',
        layer: '',
        scale_factor: 1
    });
    return (base) ? baseKeyTpl(tplValues) : rendererKeyTpl(tplValues);
};

MapStoreMapConfigProvider.prototype.getAffectedTables = function(callback) {
    var self = this;

    const { dbname, token } = self.params;

    if (self.affectedTablesCache.hasAffectedTables(dbname, token)) {
        const affectedTables = self.affectedTablesCache.get(dbname, token);

        return callback(null, affectedTables);
    }

    step(
        function getMapConfig() {
            self.getMapConfig(this);
        },
        function getSql(err, mapConfig) {
            assert.ifError(err);

            const queries = [];

            mapConfig.getLayers().forEach(function(layer) {
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

            return callback(err, affectedTables);
        }
    );
};
