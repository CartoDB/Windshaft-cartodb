module.exports = function cors(extraHeaders) {
    return function(req, res, next) {
        var baseHeaders = "X-Requested-With, X-Prototype-Version, X-CSRF-Token";
        if(extraHeaders) {
            baseHeaders += ", " + extraHeaders;
        }
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Headers", baseHeaders);
        next();
    };
};
