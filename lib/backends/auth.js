'use strict';

/**
 *
 * @param {PgConnection} pgConnection
 * @param metadataBackend
 * @param {MapStore} mapStore
 * @param {TemplateMaps} templateMaps
 * @constructor
 * @type {AuthBackend}
 */
function AuthBackend (pgConnection, metadataBackend, mapStore, templateMaps) {
    this.pgConnection = pgConnection;
    this.metadataBackend = metadataBackend;
    this.mapStore = mapStore;
    this.templateMaps = templateMaps;
}

module.exports = AuthBackend;

// Check if the user is authorized by a signer
//
// @param res express response object
// @param callback function(err, signed_by) signed_by will be
//                 null if the request is not signed by anyone
//                 or will be a string cartodb username otherwise.
//
AuthBackend.prototype.authorizedBySigner = function (req, res, callback) {
    if (!res.locals.token || !res.locals.signer) {
        return callback(null, false); // no signer requested
    }

    var self = this;

    var layergroupId = res.locals.token;
    var authToken = req.query.auth_token;

    this.mapStore.load(layergroupId, function (err, mapConfig) {
        if (err) {
            return callback(err);
        }

        var authorized = self.templateMaps.isAuthorized(mapConfig.obj().template, authToken);

        return callback(null, authorized);
    });
};

function isValidApiKey (apikey) {
    return apikey.type &&
        apikey.user &&
        apikey.databasePassword &&
        apikey.databaseRole;
}

// Check if a request is authorized by api_key
//
// @param user
// @param res express response object
// @param callback function(err, authorized)
//        NOTE: authorized is expected to be 0 or 1 (integer)
//
AuthBackend.prototype.authorizedByAPIKey = function (user, res, callback) {
    const apikeyToken = res.locals.api_key;
    const basicAuthUsername = res.locals.basicAuthUsername;

    if (!apikeyToken) {
        return callback(null, false); // no api key, no authorization...
    }

    this.metadataBackend.getApikey(user, apikeyToken, (err, apikey) => {
        if (err) {
            if (isNameNotFoundError(err)) {
                err.http_status = 404;
            }

            return callback(err);
        }

        if (!isValidApiKey(apikey)) {
            const error = new Error('Unauthorized');
            error.type = 'auth';
            error.subtype = 'api-key-not-found';
            error.http_status = 401;

            return callback(error);
        }

        if (!usernameMatches(basicAuthUsername, res.locals.user)) {
            const error = new Error('Forbidden');
            error.type = 'auth';
            error.subtype = 'api-key-username-mismatch';
            error.http_status = 403;

            return callback(error);
        }

        if (!apikey.grantsMaps) {
            const error = new Error('Forbidden');
            error.type = 'auth';
            error.subtype = 'api-key-does-not-grant-access';
            error.http_status = 403;

            return callback(error);
        }

        return callback(null, true, apikey);
    });
};

function isNameNotFoundError (err) {
    return err.message && err.message.indexOf('name not found') !== -1;
}

function usernameMatches (basicAuthUsername, requestUsername) {
    return !(basicAuthUsername && (basicAuthUsername !== requestUsername));
}

/**
 * Check access authorization
 *
 * @param req - standard req object. Importantly contains table and host information
 * @param res - standard res object. Contains the auth parameters in locals
 * @param callback function(err, allowed) is access allowed not?
 */
AuthBackend.prototype.authorize = function (req, res, callback) {
    var user = res.locals.user;

    this.authorizedByAPIKey(user, res, (err, isAuthorizedByApikey) => {
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

        this.authorizedBySigner(req, res, (err, isAuthorizedBySigner) => {
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
