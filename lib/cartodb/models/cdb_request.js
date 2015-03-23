function CdbRequest() {
}

module.exports = CdbRequest;

var RE_USER_FROM_HOST = new RegExp(global.environment.user_from_host ||
        '^([^\\.]+)\\.' // would extract "strk" from "strk.cartodb.com"
);

CdbRequest.prototype.userByReq = function(req) {
    var host = req.headers.host;
    if (req.params.user) {
        return req.params.user;
    }
    var mat = host.match(RE_USER_FROM_HOST);
    if ( ! mat ) {
        console.error("Pattern '" + RE_USER_FROM_HOST + "' does not match hostname '" + host + "'");
        return;
    }
    // console.log("Matches: "); console.dir(mat);
    if ( mat.length !== 2 ) {
        console.error("Pattern '" + RE_USER_FROM_HOST + "' gave unexpected matches against '" + host + "': ", mat);
        return;
    }
    return mat[1];
};
