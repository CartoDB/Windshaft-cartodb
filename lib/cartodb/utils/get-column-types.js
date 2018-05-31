// Postgress ID of date types
const DATE_OIDS = {
    1082: true,
    1114: true,
    1184: true
};


/**
 * Wrap a query transforming all date columns into a unix epoch
 * @param {*} originalQuery 
 * @param {*} fields 
 */
function wrapDates(originalQuery, fields) {
    return `
        SELECT 
            ${fields.map(field => DATE_OIDS.hasOwnProperty(field.dataTypeID) ? _castColumnToEpoch(field.name) : `${field.name}`).join(',')} 
        FROM 
            (${originalQuery}) _cdb_epoch_transformation `;
}

/**
 * Return a list of all the columns in the query
 * @param {*} dbConnection 
 * @param {*} originalQuery 
 */
function getColumns(user, dbConnection, layer) {
    return _getColumns(user, dbConnection, layer.options.sql);
}

/**
 * Return a sql query to transform a date column into a unix epoch
 * @param {string} column - The name of the date column
 */
function _castColumnToEpoch(columnName) {
    return `date_part('epoch', ${columnName}) as ${columnName}`;
}

function _getColumns(user, dbConnection, originalQuery) {
    return new Promise((resolve, reject) => {

        dbConnection.getConnection(user, (err, connection) => {
            if (err) {
                return reject(err);
            }
            connection.query(`SELECT * FROM (${originalQuery}) _cdb_column_type limit 0`, (err, res) => {
                if (err) {
                    return reject(err);
                }
                resolve(res);
            });
        });
    });
}


module.exports = {
    wrapDates,
    getColumns,
};