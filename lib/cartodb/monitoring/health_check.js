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
        function handleResult(err) {
            callback(err, result);
        }
    );
};
