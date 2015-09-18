function CdbRequest() {
    this.RE_USER_FROM_HOST = new RegExp(global.environment.user_from_host ||
            '^([^\\.]+)\\.' // would extract "strk" from "strk.cartodb.com"
    );
}

module.exports = CdbRequest;


CdbRequest.prototype.userByReq = function(req) {
    var host = req.headers.host;
    if (req.params.user) {
        return req.params.user;
    }
    var mat = host.match(this.RE_USER_FROM_HOST);
    if ( ! mat ) {
        global.logger.error("Pattern '%s' does not match hostname '%s'", this.RE_USER_FROM_HOST, host);
        return;
    }
    if ( mat.length !== 2 ) {
        global.logger.error("Pattern '%s' gave unexpected matches against '%s': %s", this.RE_USER_FROM_HOST, host, mat);
        return;
    }
    return mat[1];
};
