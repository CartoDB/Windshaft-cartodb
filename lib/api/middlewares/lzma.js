'use strict';

const LZMA = require('lzma').LZMA;

module.exports = function lzma () {
    const lzmaWorker = new LZMA();

    return function lzmaMiddleware (req, res, next) {
        if (!Object.prototype.hasOwnProperty.call(req.query, 'lzma')) {
            return next();
        }

        // Decode (from base64)
        var lzma = Buffer.from(req.query.lzma, 'base64')
            .toString('binary')
            .split('')
            .map(function (c) {
                return c.charCodeAt(0) - 128;
            });

        // Decompress
        lzmaWorker.decompress(lzma, function (result) {
            try {
                delete req.query.lzma;
                Object.assign(req.query, JSON.parse(result));

                req.profiler.done('lzma');

                next();
            } catch (err) {
                next(new Error('Error parsing lzma as JSON: ' + err));
            }
        });
    };
};
