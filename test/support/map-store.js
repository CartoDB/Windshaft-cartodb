'use strict';

const { MapConfig } = require('windshaft').model;

// Windshaft no longer provides the MapStore class to be used just for testing purposes
// This class provides just the method needed to load a map-config from redis
// It should be replaced by a new module @carto/map-config-storage (to be published)
module.exports = class MapStore {
    constructor (pool) {
        this.pool = pool;
    }

    load (token, callback) {
        const db = 0;
        this.pool.acquire(db, (err, client) => {
            if (err) {
                return callback(err);
            }

            client.get(`map_cfg|${token}`, (err, data) => {
                this.pool.release(db, client);

                if (err) {
                    return callback(err);
                }

                let mapConfig;
                try {
                    mapConfig = MapConfig.create(JSON.parse(data));
                } catch (err) {
                    return callback(err);
                }

                return callback(null, mapConfig);
            });
        });
    }
};
