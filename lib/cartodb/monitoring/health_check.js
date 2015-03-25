var dot = require('dot');
var fs = require('fs');
var path = require('path');
var step = require('step');

function HealthCheck(metadataBackend, tilelive) {
    this.metadataBackend = metadataBackend;
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
            mapnik: {
                ok: false
            },
            tile: {
                ok: false
            }
        };
    var mapnikXmlParams = config;

    step(
        function getManualDisable() {
          fs.readFile(global.environment.disabled_file, this);
        },
        function handleDisabledFile(err, data) {
          var next = this;
          if (err) {
            return next();
          }
          if (!!data) {
            err = new Error(data);
            err.http_status = 503;
            throw err;
          }
        },
        function getDBParams(err) {
            if (err) {
              throw err;
            }
            startTime = Date.now();
            self.metadataBackend.getAllUserDBParams(config.username, this);
        },
        function loadMapnik(err, dbParams) {
            if (err) {
                throw err;
            }
            result.redis = {
                ok: !err,
                elapsed: Date.now() - startTime,
                size: Object.keys(dbParams).length
            };
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
