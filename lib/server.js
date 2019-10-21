'use strict';

const _ = require('underscore');
const semver = require('semver');
const express = require('express');
const windshaft = require('windshaft');
const { mapnik } = windshaft;

const jsonReplacer = require('./utils/json-replacer');

const ApiRouter = require('./api/api-router');
const ServerInfoController = require('./server-info-controller');

const StatsClient = require('./stats/client');

module.exports = function createServer (serverOptions) {
    if (!Object.prototype.hasOwnProperty.call(serverOptions, 'routes')) {
        throw new Error('Must initialise server with "routes" as base paths configuration');
    }

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

    // TODO: remove it before releasing next major version
    if (!Array.isArray(serverOptions.routes.api)) {
        serverOptions.routes.api = [serverOptions.routes.api];
    }

    apiRouter.route(app, serverOptions.routes.api);

    const versions = getAndValidateVersions(serverOptions);

    const serverInfoController = new ServerInfoController(versions);
    serverInfoController.route(app);

    return app;
};

function bootstrapFonts (opts) {
    // Set carto renderer configuration for MMLStore
    opts.grainstore.carto_env = opts.grainstore.carto_env || {};
    var cenv = opts.grainstore.carto_env;
    cenv.validation_data = cenv.validation_data || {};
    if (!cenv.validation_data.fonts) {
        mapnik.register_system_fonts();
        mapnik.register_default_fonts();
        cenv.validation_data.fonts = _.keys(mapnik.fontFiles());
    }
}

function mapnikVersion (opts) {
    return opts.grainstore.mapnik_version || mapnik.versions.mapnik;
}

function getAndValidateVersions (options) {
    var warn = console.warn.bind(console); // jshint ignore:line

    var packageDefinition = require('../package.json');

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

    if (process.env.NODE_ENV !== 'test') {
        var dependenciesToValidate = ['camshaft', 'turbo-carto', 'windshaft'];
        dependenciesToValidate.forEach(function (depName) {
            var declaredDependencyVersion = declaredDependencies[depName];
            var installedDependencyVersion = installedDependenciesVersions[depName];
            if (!semver.satisfies(installedDependencyVersion, declaredDependencyVersion)) {
                warn(`Dependency="${depName}" installed version="${installedDependencyVersion}" does ` +
                     `not match declared version="${declaredDependencyVersion}". Check your installation.`);
            }
        });

        // Be nice and warn if configured mapnik version is != installed mapnik version
        if (windshaft.mapnik.versions.mapnik !== options.grainstore.mapnik_version) {
            warn('WARNING: detected mapnik version (' + windshaft.mapnik.versions.mapnik + ')' +
                ' != configured mapnik version (' + options.grainstore.mapnik_version + ')');
        }
    }

    return installedDependenciesVersions;
}
