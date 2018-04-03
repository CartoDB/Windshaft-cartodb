const _ = require('underscore');
const express = require('express');
const windshaft = require('windshaft');
const { mapnik } = windshaft;

const jsonReplacer = require('./utils/json-replacer');

const logger = require('./middleware/logger');
const bodyParser = require('body-parser');
const servedByHostHeader = require('./middleware/served-by-host-header');
const stats = require('./middleware/stats');
const lzmaMiddleware = require('./middleware/lzma');
const cors = require('./middleware/cors');
const user = require('./middleware/user');

const ControllersFactory = require('./controllers/factory');
const ServerInfoController = require('./controllers/server-info');

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

    const api = express.Router();

    api.use(logger(serverOptions));
    api.use(bodyParser.json());
    api.use(servedByHostHeader());
    api.use(stats({
        enabled: serverOptions.useProfiler,
        statsClient: global.statsClient
    }));
    api.use(lzmaMiddleware());
    api.use(cors());
    api.use(user());

    const controllers = new ControllersFactory({ serverOptions, environmentOptions: global.environment });

    controllers.regist(api);

    api.use(syntaxError());
    api.use(errorMiddleware());

    app.use('/', api);

    const versions = getAndValidateVersions(serverOptions);
    const serverInfoController = new ServerInfoController(versions);

    serverInfoController.register(app);

    // FIXME: we need a better way to reset cache while running tests
    if (process.env.NODE_ENV === 'test') {
        app.layergroupAffectedTablesCache = api.layergroupAffectedTablesCache;
    }

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

function getAndValidateVersions(options) {
    // jshint undef:false
    var warn = console.warn.bind(console);
    // jshint undef:true

    var packageDefinition = require('../../package.json');

    var declaredDependencies = packageDefinition.dependencies || {};
    var installedDependenciesVersions = {
        camshaft: require('camshaft').version,
        grainstore: windshaft.grainstore.version(),
        mapnik: windshaft.mapnik.versions.mapnik,
        node_mapnik: windshaft.mapnik.version,
        'turbo-carto': require('turbo-carto').version,
        windshaft: windshaft.version,
        windshaft_cartodb: packageDefinition.version
    };

    var dependenciesToValidate = ['camshaft', 'turbo-carto', 'windshaft'];
    dependenciesToValidate.forEach(function(depName) {
        var declaredDependencyVersion = declaredDependencies[depName];
        var installedDependencyVersion = installedDependenciesVersions[depName];
        if (declaredDependencyVersion !== installedDependencyVersion) {
            warn(
                'Dependency="%s" installed version="%s" does not match declared version="%s". Check your installation.',
                depName, installedDependencyVersion, declaredDependencyVersion
            );
        }
    });

    // Be nice and warn if configured mapnik version is != installed mapnik version
    if (windshaft.mapnik.versions.mapnik !== options.grainstore.mapnik_version) {
        warn('WARNING: detected mapnik version (' + windshaft.mapnik.versions.mapnik + ')' +
            ' != configured mapnik version (' + options.grainstore.mapnik_version + ')');
    }

    return installedDependenciesVersions;
}
