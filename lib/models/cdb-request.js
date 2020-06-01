'use strict';

function CdbRequest () {
    this.RE_USER_FROM_HOST = new RegExp(global.environment.user_from_host ||
            '^([^\\.]+)\\.' // would extract "strk" from "strk.cartodb.com"
    );
}

module.exports = CdbRequest;

CdbRequest.prototype.userByReq = function (req) {
    var host = req.headers.host || '';

    if (req.params.user) {
        return req.params.user;
    }

    var mat = host.match(this.RE_USER_FROM_HOST);

    if (!mat) {
        return global.logger.error(new Error(`Pattern '${this.RE_USER_FROM_HOST}' does not match hostname '${host}'`));
    }

    if (mat.length !== 2) {
        return global.logger.error(new Error(`Pattern '${this.RE_USER_FROM_HOST}' gave unexpected matches against '${host}': ${mat}`));
    }

    return mat[1];
};
