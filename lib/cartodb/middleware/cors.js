module.exports = function cors(extraHeaders) {
    return function(req, res, next) {
        var baseHeaders = "X-Requested-With, X-Prototype-Version, X-CSRF-Token";
        if(extraHeaders) {
            baseHeaders += ", " + extraHeaders;
        }
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", baseHeaders);
        next();
    };
};