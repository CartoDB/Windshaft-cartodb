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
PgConnection.prototype.setDBAuth = function(username, params, callback) {
    var auth_user = global.environment.postgres_auth_user;
    var auth_pass = global.environment.postgres_auth_pass;

    this.metadataBackend.getUserId(username, (err, userId) => {
        if (err) {
            return callback(err);
        }
        
        const userParams = {
            user_id: userId
        };

        params.dbuser = _.template(auth_user, userParams);

        if (!auth_pass || !auth_pass.match(/\buser_password\b/)) {
            return callback();
        }

        this.metadataBackend.getUserDBPass(username, (err, userPassword) => {
            if (err) {
                return callback(err);
            }

            userParams.user_password = userPassword;
            params.dbpassword = _.template(auth_pass, userParams);

            callback();
        });
    });
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
    var self = this;
    // Add default database connection parameters
    // if none given
    _.defaults(params, {
        dbuser: global.environment.postgres.user,
        dbpassword: global.environment.postgres.password,
        dbhost: global.environment.postgres.host,
        dbport: global.environment.postgres.port
    });
    step(
        function getConnectionParams() {
            self.metadataBackend.getUserDBConnectionParams(dbowner, this);
        },
        function extendParams(err, dbParams){
            assert.ifError(err);
            // we don't want null values or overwrite a non public user
            if (params.dbuser !== 'publicuser' || !dbParams.dbuser) {
                delete dbParams.dbuser;
            }
            if ( dbParams ) {
                _.extend(params, dbParams);
            }
            return null;
        },
        function finish(err) {
            callback(err);
        }
    );
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
            self.setDBAuth(username, params, this);
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
