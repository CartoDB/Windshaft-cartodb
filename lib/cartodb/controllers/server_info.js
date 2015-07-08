var windshaft = require('windshaft');
var HealthCheck = require('../monitoring/health_check');

var WELCOME_MSG = "This is the CartoDB Maps API, " +
    "see the documentation at http://docs.cartodb.com/cartodb-platform/maps-api.html";


var versions = {
    windshaft: windshaft.version,
    grainstore: windshaft.grainstore.version(),
    node_mapnik: windshaft.mapnik.version,
    mapnik: windshaft.mapnik.versions.mapnik,
    windshaft_cartodb: require('../../../package.json').version
};

function ServerInfoController() {
    this.healthConfig = global.environment.health || {};
    this.healthCheck = new HealthCheck();
}

module.exports = ServerInfoController;

ServerInfoController.prototype.register = function(app) {
    app.get('/health', this.health.bind(this));
    app.get('/', this.welcome.bind(this));
    app.get('/version', this.version.bind(this));
};

ServerInfoController.prototype.welcome = function(req, res) {
    res.send(WELCOME_MSG, 200);
};

ServerInfoController.prototype.version = function(req, res) {
    res.send(versions, 200);
};

ServerInfoController.prototype.health = function(req, res) {
    if (!!this.healthConfig.enabled) {
        var startTime = Date.now();
        this.healthCheck.check(this.healthConfig, function(err, result) {
            var ok = !err;
            var response = {
                enabled: true,
                ok: ok,
                elapsed: Date.now() - startTime,
                result: result
            };
            if (err) {
                response.err = err.message;
            }
            res.send(response, ok ? 200 : 503);

        });
    } else {
        res.send({enabled: false, ok: true}, 200);
    }
};
