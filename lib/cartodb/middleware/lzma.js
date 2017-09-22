'use strict';

const LZMA = require('lzma').LZMA;

const lzmaWorker = new LZMA();

module.exports = function lzmaMiddleware(req, res, next) {
    if (!req.query.hasOwnProperty('lzma')) {
        return next();
    }

    // Decode (from base64)
    var lzma = new Buffer(req.query.lzma, 'base64')
        .toString('binary')
        .split('')
        .map(function(c) {
            return c.charCodeAt(0) - 128;
        });

    // Decompress
    lzmaWorker.decompress(lzma, function(result) {
        try {
            delete req.query.lzma;
            Object.assign(req.query, JSON.parse(result));
            next();
        } catch (err) {
            next(new Error('Error parsing lzma as JSON: ' + err));
        }
    });
};
