'use strict';

var HealthCheck = require('./monitoring/health-check');

var WELCOME_MSG = 'This is the CartoDB Maps API, ' +
    'see the documentation at http://docs.cartodb.com/cartodb-platform/maps-api.html';

function ServerInfoController () {
    this.healthConfig = global.environment.health || {};
    this.healthCheck = new HealthCheck(global.environment.disabled_file);
}

module.exports = ServerInfoController;

ServerInfoController.prototype.route = function (monitorRouter) {
    monitorRouter.get('/health', this.health.bind(this));
    monitorRouter.get('/', this.welcome.bind(this));
};

ServerInfoController.prototype.welcome = function (req, res) {
    res.status(200).send(WELCOME_MSG);
};

ServerInfoController.prototype.version = function (req, res) {
    res.status(200).send(this.versions);
};

ServerInfoController.prototype.health = function (req, res) {
    if (this.healthConfig.enabled) {
        var startTime = Date.now();
        this.healthCheck.check(function (err) {
            var ok = !err;
            var response = {
                enabled: true,
                ok: ok,
                elapsed: Date.now() - startTime
            };
            if (err) {
                response.err = err.message;
            }
            res.status(ok ? 200 : 503).send(response);
        });
    } else {
        res.status(200).send({ enabled: false, ok: true });
    }
};
