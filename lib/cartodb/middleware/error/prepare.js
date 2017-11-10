
module.exports = function prepare () {
    return function prepareMiddleware(err, req, res, next) {
        let errors = Array.isArray(err) ? err : [err];

        const label = err.label || 'UNKNOWN';
        err = errors[0] || new Error(label);
        errors[0] = err;

        next(errors);
    };
};
