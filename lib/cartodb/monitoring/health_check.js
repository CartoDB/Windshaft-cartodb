var fs = require('fs');
var step = require('step');

function HealthCheck(disableFile) {
    this.disableFile = disableFile;
}

module.exports = HealthCheck;


HealthCheck.prototype.check = function(config, callback) {

    var self = this;

    step(
        function getManualDisable() {
          fs.readFile(self.disableFile, this);
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
            return callback(err);
        }
    );
};
