const _ = require('underscore');
const dot = require('dot');
const QueryTables = require('cartodb-query-tables');

// Configure bases for cache keys suitable for string interpolation
const baseKey   = '{{=it.dbname}}:{{=it.token}}';
const rendererKey = baseKey + ':{{=it.dbuser}}:{{=it.format}}:{{=it.layer}}:{{=it.scale_factor}}';

const baseKeyTpl = dot.template(baseKey);
const rendererKeyTpl = dot.template(rendererKey);

module.exports = class MapStoreMapConfigProvider {
    /**
     * @param {MapStore} mapStore
     * @param {String} user
     * @param {UserLimitsBackend} userLimitsBackend
     * @param {Object} params
     * @constructor
     * @type {MapStoreMapConfigProvider}
     */
    constructor (mapStore, user, userLimitsBackend, pgConnection, affectedTablesCache, params) {
        this.mapStore = mapStore;
        this.user = user;
        this.userLimitsBackend = userLimitsBackend;
        this.pgConnection = pgConnection;
        this.affectedTablesCache = affectedTablesCache;
        this.token = params.token;
        this.cacheBuster = params.cache_buster || 0;
        this.mapConfig = null;
        this.params = params;
        this.context = null;
    }

    getMapConfig (callback) {
        if (this.mapConfig !== null) {
            return callback(null, this.mapConfig, this.params, this.context);
        }

        const context = {};

        this.userLimitsBackend.getRenderLimits(this.user, this.params.api_key, (err, renderLimits) => {
            if (err) {
                return callback(err);
            }

            context.limits = renderLimits;

            this.mapStore.load(this.token, (err, mapConfig) => {
                if (err) {
                    return callback(err);
                }

                this.mapConfig = mapConfig;
                this.context = context;

                return callback(null, mapConfig, this.params, context);
            });
        });
    }

    getKey () {
        return this.createKey(false);
    }

    getCacheBuster () {
        return this.cacheBuster;
    }

    filter (key) {
        const regex = new RegExp('^' + this.createKey(true) + '.*');
        return key && key.match(regex);
    }

    createKey (base) {
        const tplValues = _.defaults({}, this.params, {
            dbname: '',
            token: '',
            dbuser: '',
            format: '',
            layer: '',
            scale_factor: 1
        });

        return (base) ? baseKeyTpl(tplValues) : rendererKeyTpl(tplValues);
    }

    createAffectedTables (callback) {
        this.getMapConfig((err, mapConfig) => {
            if (err) {
                return callback(err);
            }

            const { dbname } = this.params;
            const token = mapConfig.id();

            const queries = [];

            mapConfig.getLayers().forEach(layer => {
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

                    callback(err, affectedTables);
                });
            });
        });
    }

    getAffectedTables (callback) {
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
    }
};
