'use strict';

const pino = require('pino');

module.exports = class Logger {
    constructor () {
        const { LOG_LEVEL, NODE_ENV } = process.env;
        const logLevelFromNodeEnv = NODE_ENV === 'test' ? 'fatal' : 'info';
        const options = {
            base: null, // Do not bind hostname, pid and friends by default
            level: LOG_LEVEL || logLevelFromNodeEnv,
            serializers: {
                request: pino.stdSerializers.req,
                response: pino.stdSerializers.res,
                errors: (errors) => errors.map((err) => pino.stdSerializers.err(err))
            }
        };
        const dest = pino.destination({ sync: false }); // stdout

        this._logger = pino(options, dest);
    }

    trace (...args) {
        this._logger.trace(...args);
    }

    debug (...args) {
        this._logger.debug(...args);
    }

    info (...args) {
        this._logger.info(...args);
    }

    warn (...args) {
        this._logger.warn(...args);
    }

    error (...args) {
        this._logger.error(...args);
    }

    fatal (...args) {
        this._logger.fatal(...args);
    }

    child (...args) {
        return this._logger.child(...args);
    }

    finish (callback) {
        return pino.final(this._logger, callback);
    }
};
