'use strict';

module.exports = class AuthBackend {
    constructor (pgConnection, metadataBackend, mapStore, templateMaps) {
        this.pgConnection = pgConnection;
        this.metadataBackend = metadataBackend;
        this.mapStore = mapStore;
        this.templateMaps = templateMaps;
    }

    authorizedBySigner (req, res, callback) {
        if (!res.locals.token || !res.locals.signer) {
            return callback(null, false); // no signer requested
        }

        const layergroupId = res.locals.token;
        const authToken = req.query.auth_token;

        this.mapStore.load(layergroupId, (err, mapConfig) => {
            if (err) {
                return callback(err);
            }

            const authorized = this.templateMaps.isAuthorized(mapConfig.obj().template, authToken);

            return callback(null, authorized);
        });
    }

    authorizedByAPIKey (user, res, callback) {
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
    }

    authorize (req, res, callback) {
        const user = res.locals.user;

        this.authorizedByAPIKey(user, res, (err, isAuthorizedByApikey) => {
            if (err) {
                return callback(err);
            }

            if (isAuthorizedByApikey) {
                return this.pgConnection.setDBAuth(user, res.locals, 'regular', (err) => {
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
                    return this.pgConnection.setDBAuth(user, res.locals, 'master', (err) => {
                        req.profiler.done('setDBAuth');

                        if (err) {
                            return callback(err);
                        }

                        callback(null, true);
                    });
                }

                // if no signer name was given, use default api key
                if (!res.locals.signer) {
                    return this.pgConnection.setDBAuth(user, res.locals, 'default', (err) => {
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
    }
};

function isValidApiKey (apikey) {
    return apikey.type &&
        apikey.user &&
        apikey.databasePassword &&
        apikey.databaseRole;
}

function isNameNotFoundError (err) {
    return err.message && err.message.indexOf('name not found') !== -1;
}

function usernameMatches (basicAuthUsername, requestUsername) {
    return !(basicAuthUsername && (basicAuthUsername !== requestUsername));
}
