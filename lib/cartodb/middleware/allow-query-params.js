module.exports = function allowQueryParams(params) {
    if (!Array.isArray(params)) {
        throw new Error('allowQueryParams must receive an Array of params');
    }
    return function allowQueryParamsMiddleware(req, res, next) {
        res.locals.allowedQueryParams = params;
        next();
    };
};
