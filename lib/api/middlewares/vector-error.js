'use strict';

const fs = require('fs');
const path = require('path');
const timeoutErrorVectorTile = fs.readFileSync(path.join(__dirname, '/../../../assets/render-timeout-fallback.mvt'));

module.exports = function vectorError () {
    return function vectorErrorMiddleware (err, req, res, next) {
        if (req.params.format === 'mvt') {
            if (isTimeoutError(err) || isRateLimitError(err)) {
                res.set('Content-Type', 'application/x-protobuf');
                return res.status(429).send(timeoutErrorVectorTile);
            }
        }

        next(err);
    };
};

function isRenderTimeoutError (err) {
    return err.message === 'Render timed out';
}

function isDatasourceTimeoutError (err) {
    return err.message && err.message.match(/canceling statement due to statement timeout/i);
}

function isTimeoutError (err) {
    return isRenderTimeoutError(err) || isDatasourceTimeoutError(err);
}

function isRateLimitError (err) {
    return err.type === 'limit' && err.subtype === 'rate-limit';
}
