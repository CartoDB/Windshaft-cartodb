'use strict';

module.exports = function jsonReplacerFactory () {
    // Fix: https://github.com/CartoDB/Windshaft-cartodb/issues/705
    // See: http://expressjs.com/en/4x/api.html#app.set
    return function jsonReplacer (key, value) {
        if (value !== value) { // eslint-disable-line no-self-compare
            return 'NaN';
        }

        if (value === Infinity) {
            return 'Infinity';
        }

        if (value === -Infinity) {
            return '-Infinity';
        }

        return value;
    };
};
