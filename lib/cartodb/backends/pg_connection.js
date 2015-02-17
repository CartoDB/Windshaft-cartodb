var Step = require('step');
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
    var self = this;

    var user_params = {};
    var auth_user = global.environment.postgres_auth_user;
    var auth_pass = global.environment.postgres_auth_pass;
    Step(
        function getId() {
            self.metadataBackend.getUserId(username, this);
        },
        function(err, user_id) {
            if (err) throw err;
            user_params['user_id'] = user_id;
            var dbuser = _.template(auth_user, user_params);
            _.extend(params, {dbuser:dbuser});

            // skip looking up user_password if postgres_auth_pass
            // doesn't contain the "user_password" label
            if (!auth_pass || ! auth_pass.match(/\buser_password\b/) ) return null;

            self.metadataBackend.getUserDBPass(username, this);
        },
        function(err, user_password) {
            if (err) throw err;
            user_params['user_password'] = user_password;
            if ( auth_pass ) {
                var dbpass = _.template(auth_pass, user_params);
                _.extend(params, {dbpassword:dbpass});
            }
            return true;
        },
        function finish(err) {
            callback(err);
        }
    );
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
    Step(
        function getConnectionParams() {
            self.metadataBackend.getUserDBConnectionParams(dbowner, this);
        },
        function extendParams(err, dbParams){
            if (err) throw err;
            // we don't want null values or overwrite a non public user
            if (params.dbuser != 'publicuser' || !dbParams.dbuser) {
                delete dbParams.dbuser;
            }
            if ( dbParams ) _.extend(params, dbParams);
            return null;
        },
        function finish(err) {
            callback(err);
        }
    );
};
