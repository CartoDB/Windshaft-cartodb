# Logging structured traces

In order to have meaningful and useful log traces, you should follow
some general guidelines described in the [Project Guidelines](http://doc-internal.cartodb.net/platform/guidelines.html#structured-logging).

In this project there is a specific logger in place that takes care of
format and context of the traces for you. Take a look at [logger.js](https://github.com/CartoDB/Windshaft-cartodb/blob/cf82e1954e2244861e47fce0c2223ee466a5cd64/lib/utils/logger.js)
(NOTE: that file will be moved soon to a common module).

The logger is instantiated as part of the [app startup process](https://github.com/CartoDB/Windshaft-cartodb/blob/cf82e1954e2244861e47fce0c2223ee466a5cd64/app.js#L53),
then passed to middlewares and other client classes.

There are many examples of how to use the logger to generate traces
throughout the code. Here are a few of them:

```js
lib/api/middlewares/logger.js:        res.locals.logger.info({ client_request: req }, 'Incoming request');
lib/api/middlewares/logger.js:        res.on('finish', () => res.locals.logger.info({ server_response: res, status: res.statusCode }, 'Response sent'));
lib/api/middlewares/profiler.js:            logger.info({ stats, duration: stats.response / 1000, duration_ms: stats.response }, 'Request profiling stats');
lib/api/middlewares/tag.js:        res.on('finish', () => logger.info({ tags: res.locals.tags }, 'Request tagged'));
```
