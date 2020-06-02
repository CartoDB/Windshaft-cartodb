'use strict';

module.exports = class CdbRequest {
    constructor ({ logger }) {
        this.logger = logger;
        // would extract "strk" from "strk.cartodb.com"
        this.RE_USER_FROM_HOST = new RegExp(global.environment.user_from_host || '^([^\\.]+)\\.');
    }

    userByReq (req) {
        const host = req.headers.host || '';

        if (req.params.user) {
            return req.params.user;
        }

        const mat = host.match(this.RE_USER_FROM_HOST);

        if (!mat) {
            return this.logger.error(new Error(`Pattern '${this.RE_USER_FROM_HOST}' does not match hostname '${host}'`));
        }

        if (mat.length !== 2) {
            return this.logger.error(new Error(`Pattern '${this.RE_USER_FROM_HOST}' gave unexpected matches against '${host}': ${mat}`));
        }

        return mat[1];
    }
};
