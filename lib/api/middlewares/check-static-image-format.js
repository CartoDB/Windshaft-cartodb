'use strict';

const VALID_IMAGE_FORMATS = ['png', 'jpg'];

module.exports = function checkStaticImageFormat () {
    return function checkStaticImageFormatMiddleware (req, res, next) {
        if (!VALID_IMAGE_FORMATS.includes(req.params.format)) {
            return next(new Error(`Unsupported image format "${req.params.format}"`));
        }

        next();
    };
};
