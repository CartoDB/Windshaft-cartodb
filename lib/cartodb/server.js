const express = require('express');
const cors = require('./middleware/cors');
const user = require('./middleware/user');
const bodyParser = require('body-parser');
const _ = require('underscore');

const StatsClient = require('./stats/client');
const stats = require('./middleware/stats');

const { mapnik } = require('windshaft');

const lzmaMiddleware = require('./middleware/lzma');
const errorMiddleware = require('./middleware/error-middleware');
const syntaxError = require('./middleware/syntax-error');
const servedByHostHeader = require('./middleware/served-by-host-header');
const logger = require('./middleware/logger');

const ControllersFactory = require('./controllers/factory');

module.exports = function createServer (serverOptions) {
    validateOptions(serverOptions);

    // Make stats client globally accessible
    global.statsClient = StatsClient.getInstance(serverOptions.statsd);

    serverOptions.grainstore.mapnik_version = mapnikVersion(serverOptions);

    bootstrapFonts(serverOptions);

    const app = bootstrap(serverOptions);

    app.use(logger(serverOptions));

    app.use(bodyParser.json());

    app.use(servedByHostHeader());

    app.use(stats({
        enabled: serverOptions.useProfiler,
        statsClient: global.statsClient
    }));

    app.use(lzmaMiddleware());

    app.use(cors());
    app.use(user());

    const controllers = new ControllersFactory({ serverOptions, environmentOptions: global.environment });

    controllers.regist(app);

    app.use(syntaxError());
    app.use(errorMiddleware());

    return app;
};

function validateOptions(opts) {
    if (!_.isString(opts.base_url) || !_.isString(opts.base_url_mapconfig) || !_.isString(opts.base_url_templated)) {
        throw new Error("Must initialise server with: 'base_url'/'base_url_mapconfig'/'base_url_templated' URLs");
    }
}

function bootstrapFonts(opts) {
    // Set carto renderer configuration for MMLStore
    opts.grainstore.carto_env = opts.grainstore.carto_env || {};
    var cenv = opts.grainstore.carto_env;
    cenv.validation_data = cenv.validation_data || {};
    if ( ! cenv.validation_data.fonts ) {
        mapnik.register_system_fonts();
        mapnik.register_default_fonts();
        cenv.validation_data.fonts = _.keys(mapnik.fontFiles());
    }
}

function bootstrap(opts) {
    var app;
    if (_.isObject(opts.https)) {
        // use https if possible
        app = express.createServer(opts.https);
    } else {
        // fall back to http by default
        app = express();
    }
    app.enable('jsonp callback');
    app.disable('x-powered-by');
    app.disable('etag');

    // Fix: https://github.com/CartoDB/Windshaft-cartodb/issues/705
    // See: http://expressjs.com/en/4x/api.html#app.set
    app.set('json replacer', function (key, value) {
        if (value !== value) {
            return 'NaN';
        }

        if (value === Infinity) {
            return 'Infinity';
        }

        if (value === -Infinity) {
            return '-Infinity';
        }

        return value;
    });

    return app;
}

function mapnikVersion(opts) {
    return opts.grainstore.mapnik_version || mapnik.versions.mapnik;
}
