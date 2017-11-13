const prepare = require('./prepare');
const populateTimeouts = require('./populate-timeouts');
const statusCode = require('./status-code');
const logger = require('./logger');
const errorResponse = require('./error-response');

module.exports = function errorMiddleware() {
    return [
        prepare(),
        populateTimeouts(),
        statusCode(),
        logger(),
        errorResponse()
    ];
};
