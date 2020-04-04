'use strict';

const path = require('path');
const timeoutErrorTilePath = path.join(__dirname, '/../../assets/render-timeout-fallback.png');
const timeoutErrorTile = require('fs').readFileSync(timeoutErrorTilePath, { encoding: null });

module.exports = function getOnTileErrorStrategy ({ enabled }) {
    let onTileErrorStrategy;

    if (enabled !== false) {
        onTileErrorStrategy = async function onTileErrorStrategy$TimeoutTile (err, format) {
            function isRenderTimeoutError (err) {
                return err.message === 'Render timed out';
            }

            function isDatasourceTimeoutError (err) {
                return err.message && err.message.match(/canceling statement due to statement timeout/i);
            }

            function isTimeoutError (err) {
                return isRenderTimeoutError(err) || isDatasourceTimeoutError(err);
            }

            function isRasterFormat (format) {
                return format === 'png' || format === 'jpg';
            }

            if (isTimeoutError(err) && isRasterFormat(format)) {
                return { buffer: timeoutErrorTile, headers: { 'Content-Type': 'image/png' }, stats: {} };
            } else {
                throw err;
            }
        };
    }

    return onTileErrorStrategy;
};
