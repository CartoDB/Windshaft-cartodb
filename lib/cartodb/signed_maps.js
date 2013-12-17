var crypto    = require('crypto');
var Step      = require('step');
var _         = require('underscore');


// Class handling map signatures and user certificates
//
// See https://github.com/CartoDB/Windshaft-cartodb/wiki/Signed-maps
//
// @param redis_pool an instance of a "redis-mpool"
//        See https://github.com/CartoDB/node-redis-mpool
//        Needs version 0.x.x of the API.
//
function SignedMaps(redis_pool) {
  this.redis_pool = redis_pool;

  // Database containing signatures
  // TODO: allow configuring ?
  // NOTE: currently it is the same as
  //       the one containing layergroups
  this.db_signatures = 0;

  //
  // Map signatures in redis are reference to signature certificates
  // We have the following datastores:
  //
  //  1. User certificates: set of per-user authorization certificates
  //  2. Map signatures: set of per-map certificate references 
  //  3. Certificate applications: set of per-certificate signed maps

  // User certificates (HASH:crt_id->crt_val)
  this.key_map_crt = "map_crt|<%= signer %>";

  // Map signatures (SET:crt_id)
  this.key_map_sig = "map_sig|<%= signer %>|<%= map_id %>";
  
  // Certificates applications (SET:map_id)
  //
  // Everytime a map is signed, the map identifier (layergroup_id)
  // is added to this set. The purpose of this set is to drop
  // all map signatures when a certificate is removed
  //
  this.key_crt_sig = "crt_sig|<%= signer %>|<%= crt_id %>";

};

var o = SignedMaps.prototype;

//--------------- PRIVATE METHODS --------------------------------

o._acquireRedis = function(callback) {
  this.redis_pool.acquire(this.db_signatures, callback);
};

o._releaseRedis = function(client) {
  this.redis_pool.release(this.db_signatures, client);
};

/**
 * Internal function to communicate with redis
 *
 * @param redisFunc - the redis function to execute
 * @param redisArgs - the arguments for the redis function in an array
 * @param callback - function to pass results too.
 */
o._redisCmd = function(redisFunc, redisArgs, callback) {
  var redisClient;
  var that = this;
  var db = that.db_signatures;

  Step(
    function getRedisClient() {
      that.redis_pool.acquire(db, this);
    },
    function executeQuery(err, data) {
      if ( err ) throw err;
      redisClient = data;
      redisArgs.push(this);
      redisClient[redisFunc.toUpperCase()].apply(redisClient, redisArgs);
    },
    function releaseRedisClient(err, data) {
      if ( ! _.isUndefined(redisClient) ) that.redis_pool.release(db, redisClient);
      callback(err, data);
    }
  );
};

//--------------- PUBLIC API -------------------------------------

// Check if the given certificate authorizes waiver of "auth"
o.authorizedByCert = function(cert, auth) {
  //console.log("Checking cert: "); console.dir(cert);
  if ( cert.version !== "0.0.1" ) {
    throw new Error("Unsupported certificate version " + cert.version);
  }

  // Open authentication certificates are always authorized
  if ( cert.auth.method === 'open' ) return true;

  // Token based authentication requires valid token
  if ( cert.auth.method === 'token' ) {
    var found = cert.auth.valid_tokens.indexOf(auth);
    //if ( found !== -1 ) {
      //console.log("Token " + auth + " is found at position " + found + " in valid tokens " + cert.auth.valid_tokens);
    //  return true;
    //} else return false;
    return cert.auth.valid_tokens.indexOf(auth) !== -1;
  }

  throw new Error("Unsupported authentication method: " + cert.auth.method);
};

// Check if shown credential are authorized to access a map
// by the given signer.
//
// @param signer a signer name (cartodb username)
// @param map_id a layergroup_id
// @param auth an authentication token, or undefined if none
//                    (can still be authorized by signature)
//
// @param callback function(Error, Boolean)
//
o.isAuthorized = function(signer, map_id, auth, callback) {
  var that = this;
  var authorized = false;
  var certificate_id_list;
  var missing_certificates = [];
console.log("Check auth from signer '" + signer + "' on map '" + map_id + "' with auth '" + auth + "'");
  Step(
    function getMapSignatures() {
      var map_sig_key = _.template(that.key_map_sig, {signer:signer, map_id:map_id});
      that._redisCmd('SMEMBERS', [ map_sig_key ], this);
    },
    function getCertificates(err, crt_lst) {
      if ( err ) throw err;
      console.log("Map '" + map_id + "' is signed by " + crt_lst.length + " certificates of user '" + signer + "': " + crt_lst);
      certificate_id_list = crt_lst;
      if ( ! crt_lst.length ) {
        // No certs, avoid calling redis with short args list.
        // Next step expects a list of certificate values so
        // we directly send the empty list.
        return crt_lst;
      }
      var map_crt_key = _.template(that.key_map_crt, {signer:signer});
      that._redisCmd('HMGET', [ map_crt_key ].concat(crt_lst), this);
    },
    function checkCertificates(err, certs) {
      if ( err ) throw err;
      for (var i=0; i<certs.length; ++i) {
        var crt_id = certificate_id_list[i];
        if ( _.isNull(certs[i]) ) {
          missing_certificates.push(crt_id);
          continue;
        }
        var cert;
        try {
          //console.log("cert " + crt_id + ": " + certs[i]);
          cert = JSON.parse(certs[i]);
          authorized = that.authorizedByCert(cert, auth);
        } catch (err) {
          console.log("Certificate " + certificate_id_list[i] + " by user '" + signer + "' is malformed: " + err);
          continue;
        }
        if ( authorized ) {
          console.log("Access to map '" + map_id + "' authorized by cert '"
            + certificate_id_list[i] + "' of user '" + signer + "'");
          //console.dir(cert);
          break; // no need to further check certs
        }
      }
      return null;
    },
    function finish(err) {
      if ( missing_certificates.length ) {
        console.log("WARNING: map '" + map_id + "' is signed by '" + signer
          + "' with " + missing_certificates.length
          + " missing certificates: "
          + missing_certificates + " (TODO: give cleanup instructions)");
      }
      callback(err, authorized);
    }
  );
};

// Add an authorization certificate from a user.
//
// @param signer a signer name (cartodb username)
// @param cert certificate object, see
//             http://github.com/CartoDB/Windshaft-cartodb/wiki/Signed-maps
//
// @param callback function(err, crt_id) return certificate id
//
// TODO: allow for requesting error when certificate already exists ?
//
o.addCertificate = function(signer, cert, callback) {
  var crt_val = JSON.stringify(cert);
  var crt_id = crypto.createHash('md5').update(crt_val).digest('hex');

  var usr_crt_key = _.template(this.key_map_crt, {signer:signer});
  this._redisCmd('HSET', [ usr_crt_key, crt_id, crt_val ], function(err, created) {
    // NOTE: created would be 0 if the field already existed, 1 otherwise
    callback(err, crt_id);
  });
};

// Remove an authorization certificate of a user, also removing
// any signature made with the certificate.
//
// @param signer a signer name (cartodb username)
// @param crt_id certificate identifier, as returned by addCertificate
// @param callback function(err)
//
o.delCertificate = function(signer, crt_id, callback) {
  var db = this.db_signatures;
  var crt_sig_key = _.template(this.key_crt_sig, {signer:signer, crt_id:crt_id});
  var signed_map_list;
  var redis_client;
  var that = this;
  Step (
    function getRedisClient() {
      that._acquireRedis(this);
    },
    function removeCertificate(err, data) {
      if ( err ) throw err;
      redis_client = data;
      // Remove the certificate (would be enough to stop authorizing uses)
      var usr_crt_key = _.template(that.key_map_crt, {signer:signer});
      redis_client.HDEL(usr_crt_key, crt_id, this);
    },
    function getMapSignatures(err, deleted) {
      if ( err ) throw err;
      if ( ! deleted ) {
        // debugging (how can this be possible?)
        console.log("WARNING: authorization certificate '" + crt_id
          + "' by user '" + signer + "' did not exist on delete request");
      }
      // Get all signatures by this certificate
      redis_client.SMEMBERS(crt_sig_key, this);
    },
    function delMapSignaturesReference(err, map_id_list) {
      if ( err ) throw err;
      signed_map_list = map_id_list;
      console.log("Certificate '" + crt_id + "' from user '" + signer
        + "' was used to sign " + signed_map_list.length + " maps");
      redis_client.DEL(crt_sig_key, this);
    },
    function delMapSignatures(err) {
      if ( err ) throw err;
      var crt_sig_key = _.template(that.key_crt_sig, {signer:signer, crt_id:crt_id});
      var tx = redis_client.MULTI();
      for (var i=0; i<signed_map_list.length; ++i) {
        var map_id = signed_map_list[i];
        var map_sig_key = _.template(that.key_map_sig, {signer:signer, map_id:map_id});
        //console.log("Queuing removal of '" + crt_id + "' from '" + map_sig_key + "'");
        tx.SREM( map_sig_key, crt_id )
      }
      tx.EXEC(this);
    },
    function reportTransaction(err, rets) {
      if ( err ) throw err;
      for (var i=0; i<signed_map_list.length; ++i) {
        var ret = rets[i];
        if ( ! ret ) {
          console.log("No signature with certificate '" + crt_id
            + "' of user '" + signer + "' found in map '"
            + signed_map_list[i] + "'");
        } else {
          console.log("Signature with certificate '" + crt_id
            + "' of user '" + signer + "' removed from map '"
            + signed_map_list[i] + "'");
        }
      }
      return null;
    },
    function finish(err) {
      if ( ! _.isUndefined(redis_client) ) {
        that._releaseRedis(redis_client);
      }
      callback(err);
    }
  );
};

// Sign a map with a certificate reference
//
// @param signer a signer name (cartodb username)
// @param map_id a layergroup_id
// @param crt_id signature certificate identifier
//
// @param callback function(Error) 
//
o.signMap = function(signer, map_id, crt_id, callback) {
  var that = this;
  Step(
    function addMapSignature() {
      var map_sig_key = _.template(that.key_map_sig, {signer:signer, map_id:map_id});
console.log("Adding " + crt_id + " to " + map_sig_key);
      that._redisCmd('SADD', [ map_sig_key, crt_id ], this);
    },
    function addCertificateUsage(err) {
      // Add the map to the set of maps signed by the given cert
      if ( err ) throw err;
      var crt_sig_key = _.template(that.key_crt_sig, {signer:signer, crt_id:crt_id});
      that._redisCmd('SADD', [ crt_sig_key, map_id ], this);
    },
    function finish(err) {
      callback(err);
    }
  );
};

// Sign a map with a full certificate
//
// @param signer a signer name (cartodb username)
// @param map_id a layergroup_id
// @param cert_id signature certificate identifier
//
// @param callback function(Error, String) return certificate id
//
o.addSignature = function(signer, map_id, cert, callback) {
  var that = this;
  var certificate_id;
  Step(
    function addCertificate() {
      that.addCertificate(signer, cert, this);
    },
    function signMap(err, cert_id) {
      if ( err ) throw err;
      if ( ! cert_id ) throw new Error("addCertificate returned no certificate id");
      certificate_id = cert_id;
      that.signMap(signer, map_id, cert_id, this);
    },
    function finish(err) {
      callback(err, certificate_id);
    }
  );
};

module.exports = SignedMaps;
