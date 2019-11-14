'use strict';

const glob = require('glob');
const path = require('path');

// See https://github.com/CartoDB/support/issues/984
// CartoCSS properties text-wrap-width/text-wrap-character not working
function setICUEnvVariable () {
    if (process.env.ICU_DATA === undefined) {
        const regexedPath = '/node_modules/mapnik/lib/binding/*/share/mapnik/icu/';
        const directory = glob.sync(path.join(__dirname, '../../..', regexedPath));

        if (directory && directory.length > 0) {
            process.env.ICU_DATA = directory[0];
        }
    }
}

module.exports = setICUEnvVariable;
