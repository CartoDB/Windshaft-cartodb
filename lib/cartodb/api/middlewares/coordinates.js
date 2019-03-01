'use strict';

const positiveIntegerNumberRegExp = /^\d+$/;
const integerNumberRegExp = /^-?\d+$/;
const invalidZoomMessage = function (zoom) {
    return `Invalid zoom value (${zoom}). It should be an integer number greather than or equal to 0`;
};
const invalidCoordXMessage = function (x) {
    return `Invalid coodinate 'x' value (${x}). It should be an integer number`;
};
const invalidCoordYMessage = function (y) {
    return `Invalid coodinate 'y' value (${y}). It should be an integer number greather than or equal to 0`;
};

module.exports = function coordinates (validate = { z: true, x: true, y: true }) {
    return function coordinatesMiddleware (req, res, next) {
        const { z, x, y } = req.params;

        if (validate.z && !positiveIntegerNumberRegExp.test(z)) {
            const err = new Error(invalidZoomMessage(z));
            err.http_status = 400;

            return next(err);
        }

        // Negative values for x param are valid. The x param is wrapped
        if (validate.x && !integerNumberRegExp.test(x)) {
            const err = new Error(invalidCoordXMessage(x));
            err.http_status = 400;

            return next(err);
        }

        if (validate.y && !positiveIntegerNumberRegExp.test(y)) {
            const err = new Error(invalidCoordYMessage(y));
            err.http_status = 400;

            return next(err);
        }

        next();
    };
};
