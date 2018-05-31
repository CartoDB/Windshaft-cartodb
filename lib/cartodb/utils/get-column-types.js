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
function wrapDates(originalQuery, fields) {
    return `
        SELECT 
            ${fields.map(field =>  _isDateType(field) ? _castColumnToEpoch(field.name) : `${field.name}`).join(',')} 
        FROM 
            (${originalQuery}) _cdb_epoch_transformation `;
}

/**
 * @param {object} field 
 */
function _isDateType(field) {
    return DATE_OIDS.hasOwnProperty(field.dataTypeID);
}

/**
 * Return a sql query to transform a date column into a unix epoch
 * @param {string} column - The name of the date column
 */
function _castColumnToEpoch(columnName) {
    return `date_part('epoch', ${columnName}) as ${columnName}`;
}

module.exports = {
    wrapDates
};