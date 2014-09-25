var crypto  = require('crypto'),
    Step    = require('step'),
    _       = require('underscore'),
    dot     = require('dot');

// Class handling map templates
//
// See http://github.com/CartoDB/Windshaft-cartodb/wiki/Template-maps
//
// @param redis_pool an instance of a "redis-mpool"
//        See https://github.com/CartoDB/node-redis-mpool
//        Needs version 0.x.x of the API.
//
// @param signed_maps an instance of a "signed_maps" class,
//        See signed_maps.js
//
// @param opts TemplateMap options. Supported elements:
//    'max_user_templates' limit on the number of per-user
//
// 
function TemplateMaps(redis_pool, signed_maps, opts) {
  this.redis_pool = redis_pool;
  this.signed_maps = signed_maps;
  this.opts = opts || {};

  // Database containing templates
  // TODO: allow configuring ?
  // NOTE: currently it is the same as
  //       the one containing layergroups
  this.db_signatures = 0;

  //
  // Map templates are owned by a user that specifies access permissions
  // for their instances.
  // 
  // We have the following datastores:
  //
  //  1. User templates: set of per-user map templates
  //     NOTE: each template would have an associated auth
  //           reference, see signed_maps.js

  // User templates (HASH:tpl_id->tpl_val)
  this.key_usr_tpl = dot.template("map_tpl|{{=it.owner}}");

  // User template locks (HASH:tpl_id->ctime)
  this.key_usr_tpl_lck = dot.template("map_tpl|{{=it.owner}}|locks");
}

var o = TemplateMaps.prototype;

//--------------- PRIVATE METHODS --------------------------------

o._userTemplateLimit = function() {
  return this.opts['max_user_templates'] || 0;
};

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

// @param callback function(err, obtained)
o._obtainTemplateLock = function(owner, tpl_id, callback) {
  var that = this;
  var gotLock = false;
  Step (
    function obtainLock() {
      var ctime = Date.now();
      that._redisCmd('HSETNX', [that.key_usr_tpl_lck({owner:owner}), tpl_id, ctime], this);
    },
    function checkLock(err, locked) {
      if ( err ) throw err;
      if ( ! locked ) {
        // Already locked
        // TODO: unlock if expired ?
        throw new Error("Template '" + tpl_id + "' of user '" + owner + "' is locked");
      }
      return gotLock = true;
    },
    function finish(err) {
      callback(err, gotLock);
    }
  );
};

// @param callback function(err, deleted)
o._releaseTemplateLock = function(owner, tpl_id, callback) {
    this._redisCmd('HDEL', [this.key_usr_tpl_lck({owner:owner}), tpl_id], callback);
};

o._reValidIdentifier = /^[a-zA-Z][0-9a-zA-Z_]*$/;
o._checkInvalidTemplate = function(template) {
  if ( template.version != '0.0.1' ) {
    return new Error("Unsupported template version " + template.version);
  }
  var tplname = template.name;
  if ( ! tplname ) {
    return new Error("Missing template name");
  }
  if ( ! tplname.match(this._reValidIdentifier) ) {
    return new Error("Invalid characters in template name '" + tplname + "'");
  }

  var phold = template.placeholders;
  for (var k in phold) {
    if ( ! k.match(this._reValidIdentifier) ) {
      return new Error("Invalid characters in placeholder name '" + k + "'");
    }
    if ( ! phold[k].hasOwnProperty('default') ) {
      return new Error("Missing default for placeholder '" + k + "'");
    }
    if ( ! phold[k].hasOwnProperty('type') ) {
      return new Error("Missing type for placeholder '" + k + "'");
    }
  }

  // Check certificate validity
  var cert = this.getTemplateCertificate(template);
  var err = this.signed_maps.checkInvalidCertificate(cert);
  if ( err ) return err;

  // TODO: run more checks over template format ?
};

//--------------- PUBLIC API -------------------------------------

// Extract a signature certificate from a template
//
// The certificate will be ready to be passed to
// SignedMaps.addCertificate or SignedMaps.authorizedByCert
//
o.getTemplateCertificate = function(template) {
  return {
      version: '0.0.1',
      template_id: template.name,
      auth: template.auth
  };
};

// Add a template
//
// NOTE: locks user+template_name or fails
//
// @param owner cartodb username of the template owner
//
// @param template layergroup template, see
//        http://github.com/CartoDB/Windshaft-cartodb/wiki/Template-maps#template-format
//
// @param callback function(err, tpl_id) 
//        Return template identifier (only valid for given user)
//
o.addTemplate = function(owner, template, callback) {
  var invalidError = this._checkInvalidTemplate(template);
  if ( invalidError ) {
    callback(invalidError);
    return;
  }
  var tplname = template.name;

  // Procedure:
  //
  // - Check against limit
  // 0. Obtain a lock for user+template_name, fail if impossible
  // 1. Check no other template exists with the same name
  // 2. Install certificate extracted from template, extending
  //    it to contain a name to properly salt things out.
  // 3. Modify the template object to reference certificate by id
  // 4. Install template
  // 5. Release lock
  //
  //

  var usr_tpl_key = this.key_usr_tpl({owner:owner});
  var gotLock = false;
  var that = this;
  var limit = that._userTemplateLimit();
  Step(
    function checkLimit() {
      if ( ! limit ) return 0;
      that._redisCmd('HLEN', [ usr_tpl_key ], this);
    },
    // try to obtain a lock
    function obtainLock(err, len) {
      if ( err ) throw err;
      if ( limit && len >= limit ) {
        throw new Error("User '" + owner + "' reached limit on number of templates (" + len + "/" + limit + ")");
      }
      that._obtainTemplateLock(owner, tplname, this);
    },
    function getExistingTemplate(err, locked) {
      if ( err ) throw err;
      if ( ! locked ) {
        // Already locked
        throw new Error("Template '" + tplname + "' of user '" + owner + "' is locked");
      }
      gotLock = true;
      that._redisCmd('HEXISTS', [ usr_tpl_key, tplname ], this);
    },
    function installCertificate(err, exists) {
      if ( err ) throw err;
      if ( exists ) {
        throw new Error("Template '" + tplname + "' of user '" + owner + "' already exists"); 
      }
      var cert = that.getTemplateCertificate(template);
      that.signed_maps.addCertificate(owner, cert, this);
    },
    function installTemplate(err, crt_id) {
      if ( err ) throw err;
      template.auth_id = crt_id;
      var tpl_val = JSON.stringify(template);
      that._redisCmd('HSET', [ usr_tpl_key, tplname, tpl_val ], this);
    },
    function releaseLock(err, newfield) {
      if ( ! err && ! newfield ) {
        console.log("ERROR: addTemplate overridden existing template '"
          + tplname + "' of '" + owner
          + "' -- HSET returned " + overridden + ": someone added it without locking ?");
        // TODO: how to recover this ?!
      }

      if ( err && ! gotLock ) throw err;

      // release the lock
      var next = this;
      that._releaseTemplateLock(owner, tplname, function(e, d) {
        if ( e ) {
          console.log("Error removing lock on template '" + tplname
            + "' of user '" + owner + "': " + e);
        } else if ( ! d ) {
          console.log("ERROR: lock on template '" + tplname
            + "' of user '" + owner + "' externally removed during insert!");
        }
        next(err);
      });
    },
    function finish(err) {
      callback(err, tplname);
    }
  );
};

// Delete a template
//
// NOTE: locks user+template_name or fails
//
// Also deletes associated authentication certificate, which
// in turn deletes all instance signatures
//
// @param owner cartodb username of the template owner
//
// @param tpl_id template identifier as returned
//        by addTemplate or listTemplates
//
// @param callback function(err)
//
o.delTemplate = function(owner, tpl_id, callback) {
  var usr_tpl_key = this.key_usr_tpl({owner:owner});
  var gotLock = false;
  var that = this;
  Step(
    // try to obtain a lock
    function obtainLock() {
      that._obtainTemplateLock(owner, tpl_id, this);
    },
    function getExistingTemplate(err, locked) {
      if ( err ) throw err;
      if ( ! locked ) {
        // Already locked
        throw new Error("Template '" + tpl_id + "' of user '" + owner + "' is locked");
      }
      gotLock = true;
      that._redisCmd('HGET', [ usr_tpl_key, tpl_id ], this);
    },
    function delCertificate(err, tplval) {
      if ( err ) throw err;
      if ( ! tplval ) {
        throw new Error("Template '" + tpl_id + "' of user '" + owner + "' does not exist"); 
      }
      var tpl = JSON.parse(tplval);
      if ( ! tpl.auth_id ) {
        // not sure this is an error, in case we'll ever
        // allow unsigned templates...
        console.log("ERROR: installed template '" + tpl_id
            + "' of user '" + owner + "' has no auth_id reference: "); console.dir(tpl);
        return null;
      }
      var next = this;
      that.signed_maps.delCertificate(owner, tpl.auth_id, function(err) {
        if ( err ) {
          var msg = "ERROR: could not delete certificate '"
                  + tpl.auth_id + "' associated with template '"
                  + tpl_id + "' of user '" + owner + "': " + err;
          // I'm actually not sure we want this event to be fatal
          // (avoiding a deletion of the template itself) 
          next(new Error(msg));
        } else {
          next();
        }
      });
    },
    function delTemplate(err) {
      if ( err ) throw err;
      that._redisCmd('HDEL', [ usr_tpl_key, tpl_id ], this);
    },
    function releaseLock(err, deleted) {
      if ( ! err && ! deleted ) {
          console.log("ERROR: template '" + tpl_id
            + "' of user '" + owner + "' externally removed during delete!");
      }

      if ( ! gotLock ) {
        if ( err ) throw err;
        return null;
      }

      // release the lock
      var next = this;
      that._releaseTemplateLock(owner, tpl_id, function(e, d) {
        if ( e ) {
          console.log("Error removing lock on template '" + tpl_id
            + "' of user '" + owner + "': " + e);
        } else if ( ! d ) {
          console.log("ERROR: lock on template '" + tpl_id
            + "' of user '" + owner + "' externally removed during delete!");
        }
        next(err);
      });
    },
    function finish(err) {
      callback(err);
    }
  );
};

// Update a template
//
// NOTE: locks user+template_name or fails
//
// Also deletes and re-creates associated authentication certificate,
// which in turn deletes all instance signatures
//
// @param owner cartodb username of the template owner
//
// @param tpl_id template identifier as returned by addTemplate
//
// @param template layergroup template, see
//        http://github.com/CartoDB/Windshaft-cartodb/wiki/Template-maps#template-format
//
// @param callback function(err)
//        
o.updTemplate = function(owner, tpl_id, template, callback) {

  var invalidError = this._checkInvalidTemplate(template);
  if ( invalidError ) {
    callback(invalidError);
    return;
  }

  var tplname = template.name;

  if ( tpl_id != tplname ) {
    callback(new Error("Cannot update name of a map template ('" + tpl_id + "' != '" + tplname + "')"));
    return;
  }

  var usr_tpl_key = this.key_usr_tpl({owner:owner});
  var gotLock = false;
  var that = this;
  Step(
    // try to obtain a lock
    function obtainLock() {
      that._obtainTemplateLock(owner, tpl_id, this);
    },
    function getExistingTemplate(err, locked) {
      if ( err ) throw err;
      if ( ! locked ) {
        // Already locked
        throw new Error("Template '" + tpl_id + "' of user '" + owner + "' is locked");
      }
      gotLock = true;
      that._redisCmd('HGET', [ usr_tpl_key, tpl_id ], this);
    },
    function delOldCertificate(err, tplval) {
      if ( err ) throw err;
      if ( ! tplval ) {
        throw new Error("Template '" + tpl_id + "' of user '"
                         + owner +"' does not exist");
      }
      var tpl = JSON.parse(tplval);
      if ( ! tpl.auth_id ) {
        // not sure this is an error, in case we'll ever
        // allow unsigned templates...
        console.log("ERROR: installed template '" + tpl_id
            + "' of user '" + owner + "' has no auth_id reference: "); console.dir(tpl);
        return null;
      }
      var next = this;
      that.signed_maps.delCertificate(owner, tpl.auth_id, function(err) {
        if ( err ) {
          var msg = "ERROR: could not delete certificate '"
                  + tpl.auth_id + "' associated with template '"
                  + tpl_id + "' of user '" + owner + "': " + err;
          // I'm actually not sure we want this event to be fatal
          // (avoiding a deletion of the template itself) 
          next(new Error(msg));
        } else {
          next();
        }
      });
    },
    function installNewCertificate(err) {
      if ( err ) throw err;
      var cert = that.getTemplateCertificate(template);
      that.signed_maps.addCertificate(owner, cert, this);
    },
    function updTemplate(err, crt_id) {
      if ( err ) throw err;
      template.auth_id = crt_id;
      var tpl_val = JSON.stringify(template);
      that._redisCmd('HSET', [ usr_tpl_key, tplname, tpl_val ], this);
    },
    function releaseLock(err, newfield) {
      if ( ! err && newfield ) {
          console.log("ERROR: template '" + tpl_id
            + "' of user '" + owner + "' externally removed during update!");
      }

      if ( ! gotLock ) {
        if ( err ) throw err;
        return null;
      }

      // release the lock
      var next = this;
      that._releaseTemplateLock(owner, tpl_id, function(e, d) {
        if ( e ) {
          console.log("Error removing lock on template '" + tpl_id
            + "' of user '" + owner + "': " + e);
        } else if ( ! d ) {
          console.log("ERROR: lock on template '" + tpl_id
            + "' of user '" + owner + "' externally removed during update!");
        }
        next(err);
      });
    },
    function finish(err) {
      callback(err);
    }
  );
};

// List user templates
//
// @param owner cartodb username of the templates owner
//
// @param callback function(err, tpl_id_list)
//        Returns a list of template identifiers
// 
o.listTemplates = function(owner, callback) {
    this._redisCmd('HKEYS', [ this.key_usr_tpl({owner:owner}) ], callback);
};

// Get a templates
//
// @param owner cartodb username of the template owner
//
// @param tpl_id template identifier as returned
//        by addTemplate or listTemplates
//
// @param callback function(err, template)
//        Return full template definition
//
o.getTemplate = function(owner, tpl_id, callback) {
  var that = this;
  Step(
    function getTemplate() {
      that._redisCmd('HGET', [ that.key_usr_tpl({owner:owner}), tpl_id ], this);
    },
    function parseTemplate(err, tpl_val) {
      if ( err ) throw err;
      // Should we strip auth_id ?
      return JSON.parse(tpl_val);
    },
    function finish(err, tpl) {
      callback(err, tpl);
    }
  );
};

// Perform placeholder substitutions on a template
//
// @param template a template object (will not be modified)
//
// @param params an object containing named subsitution parameters
//        Only the ones found in the template's placeholders object
//        will be used, with missing ones taking default values.
//
// @returns a layergroup configuration 
//
// @throws Error on malformed template or parameter
//
o._reNumber = /^([-+]?[\d\.]?\d+([eE][+-]?\d+)?)$/;
o._reCSSColorName = /^[a-zA-Z]+$/;
o._reCSSColorVal = /^#[0-9a-fA-F]{3,6}$/;
o._replaceVars = function(str, params) {
  //return _.template(str, params); // lazy way, possibly dangerous 
  // Construct regular expressions for each param
    Object.keys(params).forEach(function(k) {
        str = str.replace(new RegExp("<%=\\s*" + k + "\\s*%>", "g"), params[k]);
    });
    return str;
};
o.instance = function(template, params) {
  var all_params = {};
  var phold = template.placeholders;
  for (var k in phold) {
    var val = params.hasOwnProperty(k) ? params[k] : phold[k].default;
    var type = phold[k].type;
    // properly escape
    if ( type === 'sql_literal' ) {
      // duplicate any single-quote
      val = val.replace(/'/g, "''");
    }
    else if ( type === 'sql_ident' ) {
      // duplicate any double-quote
      val = val.replace(/"/g, '""');
    }
    else if ( type === 'number' ) {
      // check it's a number
      if ( typeof(val) !== 'number' && ! val.match(this._reNumber) ) {
        throw new Error("Invalid number value for template parameter '"
          + k + "': " + val);
      }
    }
    else if ( type === 'css_color' ) {
      // check it only contains letters or
      // starts with # and only contains hexdigits
      if ( ! val.match(this._reCSSColorName) && ! val.match(this._reCSSColorVal) ) {
        throw new Error("Invalid css_color value for template parameter '"
          + k + "': " + val);
      }
    }
    else {
      // NOTE: should be checked at template create/update time
      throw new Error("Invalid placeholder type '" + type + "'");
    }
    all_params[k] = val;
  }

  // NOTE: we're deep-cloning the layergroup here
  var layergroup = JSON.parse(JSON.stringify(template.layergroup));
  for (var i=0; i<layergroup.layers.length; ++i) {
    var lyropt = layergroup.layers[i].options;
    if ( lyropt.cartocss ) lyropt.cartocss = this._replaceVars(lyropt.cartocss, all_params);
    if ( lyropt.sql) lyropt.sql = this._replaceVars(lyropt.sql, all_params);
    // Anything else ?
  }
  return layergroup;
};

// Return a fingerPrint of the object
o.fingerPrint = function(template) {
  return crypto.createHash('md5')
    .update(JSON.stringify(template))
    .digest('hex')
  ;
};

module.exports = TemplateMaps;
