var assert = require('assert');
var step = require('step');
var PSQL = require('cartodb-psql');
var _ = require('underscore');

function PgConnection(metadataBackend) {
    this.metadataBackend = metadataBackend;
}

module.exports = PgConnection;


// Set db authentication parameters to those of the given username
//
// @param username the cartodb username, mapped to a database username
//                 via CartodbRedis metadata records
//
// @param params the parameters to set auth options into
//               added params are: "dbuser" and "dbpassword"
//
// @param callback function(err)
//
PgConnection.prototype.setDBAuth = function(username, params, asMaster, callback) {
    if (asMaster) {
        this.metadataBackend.getMasterApikey(username, (err, apikey) => {
            if (err) {
                return callback(err);
            }

            params.dbuser = apikey.databaseRole;
            params.dbpassword = apikey.databasePassword;

            return callback();
        });
    } else {
        this.metadataBackend.getApikey(username, params.api_key || params.map_key, (err, apikey) => {
            if (err) {
                return callback(err);
            }

            params.dbuser = apikey.databaseRole;
            params.dbpassword = apikey.databasePassword;

            return callback();           
        });
    }
};

// Set db connection parameters to those for the given username
//
// @param dbowner cartodb username of database owner,
//                mapped to a database username
//                via CartodbRedis metadata records
//
// @param params the parameters to set connection options into
//               added params are: "dbname", "dbhost"
//
// @param callback function(err)
//
PgConnection.prototype.setDBConn = function(dbowner, params, callback) {
    _.defaults(params, {
        dbuser: global.environment.postgres.user,
        dbpassword: global.environment.postgres.password,
        dbhost: global.environment.postgres.host,
        dbport: global.environment.postgres.port
    });

    this.metadataBackend.getUserDBConnectionParams(dbowner, (err, dbParams) => {
        if (err) {
            return callback(err);
        }

        // we don’t want null values or overwrite a non public user
        if (params.dbuser !== 'publicuser' || !dbParams.dbuser) {
            delete dbParams.dbuser;
        }

        if (dbParams) {
            _.extend(params, dbParams);
        }

        callback();
    });
};

/**
 * Returns a `cartodb-psql` object for a given username.
 * @param {String} username
 * @param {Function} callback function({Error}, {PSQL})
 */

PgConnection.prototype.getConnection = function(username, callback) {
    var self = this;

    var params = {};

    require('debug')('cachechan')("getConn1");
    step(
        function setAuth() {
            const asMaster = true;
            self.setDBAuth(username, params, asMaster, this);
        },
        function setConn(err) {
            assert.ifError(err);
            self.setDBConn(username, params, this);
        },
        function openConnection(err) {
            assert.ifError(err);
            return callback(err, new PSQL({
                user: params.dbuser,
                pass: params.dbpass,
                host: params.dbhost,
                port: params.dbport,
                dbname: params.dbname
            }));
        }
    );
};
