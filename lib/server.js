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

    const serverInfoController = new ServerInfoController();
    serverInfoController.route(app);

    return app;
};
