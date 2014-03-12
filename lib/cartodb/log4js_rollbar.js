var rollbar = require("rollbar");

/**
 * Rollbar Appender. Sends logging events to Rollbar using node-rollbar 
 *
 * @param config object with rollbar configuration data
 * {
 *   token: 'your-secret-token',
 *   options: node-rollbar options
 * }
 */
function rollbarAppender(config) {

  var opt = config.options;
	rollbar.init(opt.token, opt.options);
	
	return function(loggingEvent) {
/*
For logger.trace('one','two','three'):
{ startTime: Wed Mar 12 2014 16:27:40 GMT+0100 (CET),
  categoryName: '[default]',
  data: [ 'one', 'two', 'three' ],
  level: { level: 5000, levelStr: 'TRACE' },
  logger: { category: '[default]', _events: { log: [Object] } } }
*/

    // Levels:
    // TRACE  5000
    // DEBUG 10000
    // INFO  20000
    // WARN  30000
    // ERROR 40000
    // FATAL 50000
    //
    // We only log error and higher errors
    //
    if ( loggingEvent.level.level < 40000 ) return;

    rollbar.reportMessage(loggingEvent.data);
	};
}

function configure(config) {
	return rollbarAppender(config);
}

exports.name      = "rollbar";
exports.appender  = rollbarAppender;
exports.configure = configure;
