const _ = require('underscore');
const express = require('express');
const { mapnik } = require('windshaft');

const jsonReplacer = require('./utils/json-replacer');

const logger = require('./middleware/logger');
const bodyParser = require('body-parser');
const servedByHostHeader = require('./middleware/served-by-host-header');
const stats = require('./middleware/stats');
const lzmaMiddleware = require('./middleware/lzma');
const cors = require('./middleware/cors');
const user = require('./middleware/user');

const ControllersFactory = require('./controllers/factory');

const syntaxError = require('./middleware/syntax-error');
const errorMiddleware = require('./middleware/error-middleware');

const StatsClient = require('./stats/client');

module.exports = function createServer (serverOptions) {
    validateOptions(serverOptions);

    // Make stats client globally accessible
    global.statsClient = StatsClient.getInstance(serverOptions.statsd);

    serverOptions.grainstore.mapnik_version = mapnikVersion(serverOptions);

    bootstrapFonts(serverOptions);

    const app = express();

    app.enable('jsonp callback');
    app.disable('x-powered-by');
    app.disable('etag');
    app.set('json replacer', jsonReplacer());

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

function mapnikVersion(opts) {
    return opts.grainstore.mapnik_version || mapnik.versions.mapnik;
}
