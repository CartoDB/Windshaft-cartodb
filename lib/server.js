'use strict';

const express = require('express');
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

    // FIXME: do not pass 'global.environment' as 'serverOptions' should keep defaults from 'global.environment'
    const apiRouter = new ApiRouter({ serverOptions, environmentOptions: global.environment });

    apiRouter.route(app, serverOptions.routes.api);

    const serverInfoController = new ServerInfoController();
    serverInfoController.route(app);

    return app;
};
