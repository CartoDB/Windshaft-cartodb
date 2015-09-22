var fs = require('fs');

function HealthCheck(disableFile) {
    this.disableFile = disableFile;
}

module.exports = HealthCheck;


HealthCheck.prototype.check = function(callback) {
    fs.readFile(this.disableFile, function handleDisabledFile(err, data) {
        var disabledError = null;
        if (!!data) {
            disabledError = new Error(data);
            disabledError.http_status = 503;
        }
        return callback(disabledError);
    });
};
