var assert = require('assert');
var step = require('step');

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
        return callback(null, 0); // no api key, no authorization...
    }

    var self = this;

    step(
        function () {
            self.metadataBackend.getUserMapKey(user, this);
        },
        function checkApiKey(err, val){
            assert.ifError(err);
            return val && givenKey === val;
        },
        function finish(err, authorized) {
            callback(err, authorized);
        }
    );
};

/**
 * Check access authorization
 *
 * @param req - standard req object. Importantly contains table and host information
 * @param res - standard res object. Contains the auth parameters in locals
 * @param callback function(err, allowed) is access allowed not?
 */
AuthApi.prototype.authorize = function(req, res, callback) {
    var self = this;
    var user = res.locals.user;

    step(
        function () {
            self.authorizedByAPIKey(user, req, this);
        },
        function checkApiKey(err, authorized){
            req.profiler.done('authorizedByAPIKey');
            assert.ifError(err);

            // if not authorized by api_key, continue
            if (!authorized)  {
                // not authorized by api_key, check if authorized by signer
                return self.authorizedBySigner(res, this);
            }

            // authorized by api key, login as the given username and stop
            self.pgConnection.setDBAuth(user, res.locals, function(err) {
                callback(err, true); // authorized (or error)
            });
        },
        function checkSignAuthorized(err, authorized) {
            if (err) {
                return callback(err);
            }

            if ( ! authorized ) {
                // request not authorized by signer.

                // if no signer name was given, let dbparams and
                // PostgreSQL do the rest.
                //
                if ( ! res.locals.signer ) {
                    return callback(null, true); // authorized so far
                }

                // if signer name was given, return no authorization
                return callback(null, false);
            }

            self.pgConnection.setDBAuth(user, res.locals, function(err) {
                req.profiler.done('setDBAuth');
                callback(err, true); // authorized (or error)
            });
        }
    );
};
