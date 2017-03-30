module.exports = function allowQueryParams(params) {
    return function allowQueryParamsMiddleware(req, res, next) {
        req.context.allowedQueryParams = params;
        next();
    };
};
