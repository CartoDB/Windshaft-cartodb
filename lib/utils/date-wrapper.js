'use strict';

const DATE_OIDS = Object.freeze({
    1082: 'DATE',
    1083: 'TIME',
    1114: 'TIMESTAMP',
    1184: 'TIMESTAMPTZ',
    1266: 'TIMETZ'
});

/**
 * Wrap a query transforming all date columns into a unix epoch
 * @param {*} originalQuery
 * @param {*} fields
 */
function wrapDates (originalQuery, fields) {
    return `
        SELECT
            ${fields.map(field => _isDateType(field) ? _castColumnToEpoch(field.name) : `"${field.name}"`).join(',')}
        FROM
            (${originalQuery}) _cdb_epoch_transformation `;
}

/**
 * @param {object} field
 */
function _isDateType (field) {
    return Object.prototype.hasOwnProperty.call(DATE_OIDS, field.dataTypeID);
}

/**
 * Return a sql query to transform a date column into a unix epoch
 * @param {string} column - The name of the date column
 */
function _castColumnToEpoch (columnName) {
    return `date_part('epoch', "${columnName}") as "${columnName}"`;
}

function getColumnsWithWrappedDates (query) {
    if (!query) {
        return;
    }
    if (!query.match(/\b_cdb_epoch_transformation\b/)) {
        return;
    }
    const columns = [];
    const fieldMatcher = /\bdate_part\('epoch', "([^"]+)"\) as "([^"]+)"/gmi;
    let match;
    do {
        match = fieldMatcher.exec(query);
        if (match && match[1] === match[2]) {
            columns.push(match[1]);
        }
    } while (match);
    return columns;
}

module.exports = {
    wrapDates,
    getColumnsWithWrappedDates
};
