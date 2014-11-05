var _    = require('underscore'),
    dot  = require('dot'),
    fs   = require('fs'),
    path = require('path'),
    Step = require('step');

function HealthCheck(metadataBackend, queryTablesApi, tilelive) {
    this.metadataBackend = metadataBackend;
    this.queryTablesApi = queryTablesApi;
    this.tilelive = tilelive;
}

module.exports = HealthCheck;


var mapnikOptions = {
    query: {
        metatile: 1,
        poolSize: 4,
        bufferSize: 64
    },
    protocol: 'mapnik:',
    slashes: true,
    xml: null
};

var xmlTemplate = dot.template(fs.readFileSync(path.resolve(__dirname, 'map-config.xml'), 'utf-8'));

HealthCheck.prototype.check = function(config, callback) {

    var self = this,
        startTime,
        result = {
            redis: {
                ok: false
            },
            postgresql: {
                ok: false
            },
            mapnik: {
                ok: false
            },
            tile: {
                ok: false
            }
        },
        mapnikXmlParams = _.extend({
            dbport: global.environment.postgres.port
        }, config);

    Step(
        function getDBParams() {
            startTime = Date.now();
            self.metadataBackend.getAllUserDBParams(config.username, this);
        },
        function runQuery(err, dbParams) {
            if (err) {
                throw err;
            }

            result.redis = {
                ok: !err,
                elapsed: Date.now() - startTime,
                size: Object.keys(dbParams).length
            };

            dbParams.dbuser = _.template(global.environment.postgres_auth_user, {user_id: dbParams.dbuser});

            mapnikXmlParams = _.extend(mapnikXmlParams, dbParams);

            startTime = Date.now();
            self.queryTablesApi.getAffectedTablesInQuery(config.username, {
                user: dbParams.dbuser,
                pass: dbParams.dbpass,
                host: dbParams.dbhost,
                port: global.environment.postgres.port,
                dbname: dbParams.dbname,
                api_key: dbParams.apikey
            }, config.query, this);
        },
        function handleAffectedTablesQuery(err, affectedTables) {
            if (err) {
                throw err;
            }

            result.postgresql = {
                ok: !err,
                elapsed: Date.now() - startTime,
                size: affectedTables.length
            };

            this();
        },
        function loadMapnik(err) {
            if (err) {
                throw err;
            }
            mapnikOptions.xml = xmlTemplate(mapnikXmlParams);

            startTime = Date.now();
            self.tilelive.load(mapnikOptions, this);
        },
        function getTile(err, source) {
            if (err) {
                throw err;
            }

            result.mapnik = {
                ok: !err,
                elapsed: Date.now() - startTime
            };

            startTime = Date.now();
            source.getTile(config.z, config.x, config.y, this);
        },
        function handleTile(err, tile) {
            result.tile = {
                ok: !err
            };

            if (tile) {
                result.tile.elapsed = Date.now() - startTime;
                result.tile.size = tile.length;
            }

            callback(err, result);
        }
    );
};