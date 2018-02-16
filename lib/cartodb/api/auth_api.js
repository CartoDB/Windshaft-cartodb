var _ = require('underscore'); // AUTH_FALLBACK

/**
 *
 * @param {PgConnection} pgConnection
 * @param metadataBackend
 * @param {MapStore} mapStore
 * @param {TemplateMaps} templateMaps
 * @constructor
 * @type {AuthApi}
 */
function AuthApi(pgConnection, metadataBackend, mapStore, templateMaps) {
    this.pgConnection = pgConnection;
    this.metadataBackend = metadataBackend;
    this.mapStore = mapStore;
    this.templateMaps = templateMaps;
}

module.exports = AuthApi;

// Check if the user is authorized by a signer
//
// @param res express response object
// @param callback function(err, signed_by) signed_by will be
//                 null if the request is not signed by anyone
//                 or will be a string cartodb username otherwise.
//
AuthApi.prototype.authorizedBySigner = function(res, callback) {
    if ( ! res.locals.token || ! res.locals.signer ) {
        return callback(null, false); // no signer requested
    }

    var self = this;

    var layergroup_id = res.locals.token;
    var auth_token = res.locals.auth_token;

    this.mapStore.load(layergroup_id, function(err, mapConfig) {
        if (err) {
            return callback(err);
        }

        var authorized = self.templateMaps.isAuthorized(mapConfig.obj().template, auth_token);

        return callback(null, authorized);
    });
};

function isValidApiKey(apikey) {
    return apikey.type &&
        apikey.user &&
        apikey.databasePassword &&
        apikey.databaseRole;
}

// Check if a request is authorized by api_key
//
// @param user
// @param req express request object
// @param callback function(err, authorized)
//        NOTE: authorized is expected to be 0 or 1 (integer)
//
AuthApi.prototype.authorizedByAPIKey = function(user, req, callback) {
    var givenKey = req.query.api_key || req.query.map_key;
    if ( ! givenKey && req.body ) {
        // check also in request body
        givenKey = req.body.api_key || req.body.map_key;
    }
    if ( ! givenKey ) {
        return callback(null, false); // no api key, no authorization...
    }

    this.metadataBackend.getApikey(user, givenKey, (err, apikey) => {
        if (err) {
            return callback(err);
        }

        //Remove this block when Auth fallback is not used anymore
        // AUTH_FALLBACK
        if (!apikey.databaseRole && apikey.user_id && global.environment.postgres_auth_user) {
            apikey.databaseRole = _.template(global.environment.postgres_auth_user, apikey);
        }

        //Remove this block when Auth fallback is not used anymore
        // AUTH_FALLBACK
        if (!apikey.databasePassword && global.environment.postgres.password) {
            apikey.databasePassword = global.environment.postgres.password;
        }

        if ( !isValidApiKey(apikey)) {
            return callback(null, true); // AUTH_FALLBACK :S If api key not found, use default_public

            const error = new Error('Unauthorized');
            error.type = 'auth';
            error.subtype = 'api-key-not-found';
            error.http_status = 401;

            return callback(error);
        }

        if (!apikey.grantsMaps) {
            const error = new Error('Forbidden');
            error.type = 'auth';
            error.subtype = 'api-key-does-not-grant-access';
            error.http_status = 403;

            return callback(error);
        }

        return callback(null, true);
    });
};

/**
 * Check access authorization
 *
 * @param req - standard req object. Importantly contains table and host information
 * @param res - standard res object. Contains the auth parameters in locals
 * @param callback function(err, allowed) is access allowed not?
 */
AuthApi.prototype.authorize = function(req, res, callback) {
    var user = res.locals.user;

    this.authorizedByAPIKey(user, req, (err, isAuthorizedByApikey) => {
        if (err) {
            return callback(err);
        }

        if (isAuthorizedByApikey) {
            return this.pgConnection.setDBAuth(user, res.locals, 'regular', function (err) {
                req.profiler.done('setDBAuth');

                if (err) {
                    return callback(err);
                } 
                
                callback(null, true);
            });
        }

        this.authorizedBySigner(res, (err, isAuthorizedBySigner) => {
            if (err) {
                return callback(err);
            }
            
            if (isAuthorizedBySigner) {
                return this.pgConnection.setDBAuth(user, res.locals, 'master', function (err) {
                    req.profiler.done('setDBAuth');
                    
                    if (err) {
                        return callback(err);
                    } 

                    callback(null, true);
                }); 
            }

            // if no signer name was given, use default api key
            if (!res.locals.signer) {
                return this.pgConnection.setDBAuth(user, res.locals, 'default', function (err) {
                    req.profiler.done('setDBAuth');

                    if (err) {
                        return callback(err);
                    }

                    callback(null, true);
                }); 
            }

            // if signer name was given, return no authorization
            return callback(null, false);
        });
    });
};
