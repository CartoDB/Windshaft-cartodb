'use strict';

const { queryTables } = require('cartodb-query-tables');

module.exports = class BaseMapConfigProvider {
    createAffectedTables (callback) {
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

                queryTables.getQueryMetadataModel(connection, sql)
                    .then(affectedTables => {
                        this.affectedTablesCache.set(dbname, token, affectedTables);
                        callback(null, affectedTables);
                    })
                    .catch(err => callback(err));
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
