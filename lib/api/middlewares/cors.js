'use strict';

module.exports = function cors () {
    return function corsMiddleware (req, res, next) {
        const headers = [
            'X-Requested-With',
            'X-Prototype-Version',
            'X-CSRF-Token',
            'Authorization'
        ];

        if (req.method === 'OPTIONS') {
            headers.push('Content-Type');
        }

        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Headers', headers.join(', '));

        next();
    };
};
