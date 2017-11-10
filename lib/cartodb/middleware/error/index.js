const prepare = require('./prepare');
const populateTimeouts = require('./populate-timeouts');
const error = require('./error-middleware');

module.exports = function errorMiddleware() {
    return [
        prepare(),
        populateTimeouts(),
        error()
    ];
};
