module.exports = function coordinates (validate = { z: true, x: true, y: true }) {
    const positiveIntegerNumber = /^\d+$/;
    const integerNumber = /^-?\d+$/;

    return function coordinatesMiddleware (req, res, next) {
        const { z, x, y } = req.params;

        if (validate.z && !positiveIntegerNumber.test(z)) {
            const err = new Error(`Invalid zoom value (${z}). It should be a positive number`);
            err.http_status = 400;

            return next(err);
        }

        // Negatives values for x param are valid. The x param is wrapped
        if (validate.x && !integerNumber.test(x)) {
            const err = new Error(`Invalid coodinate 'x' value (${x}). It should be a number`);
            err.http_status = 400;

            return next(err);
        }

        if (validate.y && !positiveIntegerNumber.test(y)) {
            const err = new Error(`Invalid coodinate 'y' value (${y}). It should be a positive number`);
            err.http_status = 400;

            return next(err);
        }

        next();
    };
};
