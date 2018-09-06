const _ = require('underscore');
const express = require('express');
const windshaft = require('windshaft');
const { mapnik } = windshaft;

const jsonReplacer = require('./utils/json-replacer');

const ApiRouter = require('./api/api-router');
const ServerInfoController = require('./server-info-controller');

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

    const apiRouter = new ApiRouter({ serverOptions, environmentOptions: global.environment });
    apiRouter.register(app);

    const versions = getAndValidateVersions(serverOptions);

    const serverInfoController = new ServerInfoController(versions);
    serverInfoController.register(app);

    if (global.environment.enabledFeatures.useOverviewsTables === undefined) {
        global.environment.enabledFeatures.useOverviewsTables = false; //Overviews deprecation
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
