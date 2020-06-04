'use strict';

module.exports = class CdbRequest {
    constructor () {
        // would extract "strk" from "strk.cartodb.com"
        this.RE_USER_FROM_HOST = new RegExp(global.environment.user_from_host || '^([^\\.]+)\\.');
    }

    userByReq (req) {
        const host = req.headers.host || '';

        if (req.params.user) {
            return req.params.user;
        }

        const mat = host.match(this.RE_USER_FROM_HOST);

        if (!mat || mat.length !== 2) {
            throw new Error(`No username found in hostname '${host}'`);
        }

        return mat[1];
    }
};
