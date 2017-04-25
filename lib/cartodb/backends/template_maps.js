var assert = require('assert');
var crypto = require('crypto');
var debug = require('debug')('windshaft:templates');
var step = require('step');
var _ = require('underscore');
var dot = require('dot');


var EventEmitter = require('events').EventEmitter;
var util = require('util');


// Class handling map templates
//
// See http://github.com/CartoDB/Windshaft-cartodb/wiki/Template-maps
//
// @param redis_pool an instance of a "redis-mpool"
//        See https://github.com/CartoDB/node-redis-mpool
//        Needs version 0.x.x of the API.
//
// @param opts TemplateMap options. Supported elements:
//    'max_user_templates' limit on the number of per-user
//
//
function TemplateMaps(redis_pool, opts) {
  if (!(this instanceof TemplateMaps)) {
      return new TemplateMaps();
  }

  EventEmitter.call(this);

  this.redis_pool = redis_pool;
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

  // User templates (HASH:tpl_id->tpl_val)
  this.key_usr_tpl = dot.template("map_tpl|{{=it.owner}}");
}

util.inherits(TemplateMaps, EventEmitter);

module.exports = TemplateMaps;


//--------------- PRIVATE METHODS --------------------------------

TemplateMaps.prototype._userTemplateLimit = function() {
  return this.opts.max_user_templates || 0;
};

/**
 * Internal function to communicate with redis
 *
 * @param redisFunc - the redis function to execute
 * @param redisArgs - the arguments for the redis function in an array
 * @param callback - function to pass results too.
 */
TemplateMaps.prototype._redisCmd = function(redisFunc, redisArgs, callback) {
  var redisClient;
  var that = this;
  var db = that.db_signatures;

  step(
    function getRedisClient() {
      that.redis_pool.acquire(db, this);
    },
    function executeQuery(err, data) {
      assert.ifError(err);
      redisClient = data;
      redisArgs.push(this);
      redisClient[redisFunc.toUpperCase()].apply(redisClient, redisArgs);
    },
    function releaseRedisClient(err, data) {
      if ( ! _.isUndefined(redisClient) ) {
          that.redis_pool.release(db, redisClient);
      }
      callback(err, data);
    }
  );
};

var _reValidNameIdentifier = /^[a-z0-9][0-9a-z_\-]*$/i;
var _reValidPlaceholderIdentifier = /^[a-z][0-9a-z_]*$/i;
// jshint maxcomplexity:15
TemplateMaps.prototype._checkInvalidTemplate = function(template) {
  if ( template.version !== '0.0.1' ) {
    return new Error("Unsupported template version " + template.version);
  }
  var tplname = template.name;
  if ( ! tplname ) {
    return new Error("Missing template name");
  }
  if ( ! tplname.match(_reValidNameIdentifier) ) {
    return new Error("Invalid characters in template name '" + tplname + "'");
  }

  var invalidError = isInvalidLayergroup(template.layergroup);
  if (invalidError) {
    return invalidError;
  }

  var placeholders = template.placeholders || {};

  var placeholderKeys = Object.keys(placeholders);
  for (var i = 0, len = placeholderKeys.length; i < len; i++) {
      var placeholderKey = placeholderKeys[i];

      if (!placeholderKey.match(_reValidPlaceholderIdentifier)) {
          return new Error("Invalid characters in placeholder name '" + placeholderKey + "'");
      }
      if ( ! placeholders[placeholderKey].hasOwnProperty('default') ) {
          return new Error("Missing default for placeholder '" + placeholderKey + "'");
      }
      if ( ! placeholders[placeholderKey].hasOwnProperty('type') ) {
          return new Error("Missing type for placeholder '" + placeholderKey + "'");
      }
  }

    var auth = template.auth || {};

    switch ( auth.method ) {
        case 'open':
            break;
        case 'token':
            if ( ! _.isArray(auth.valid_tokens) ) {
                return new Error("Invalid 'token' authentication: missing valid_tokens");
            }
            if ( ! auth.valid_tokens.length ) {
                return new Error("Invalid 'token' authentication: no valid_tokens");
            }
            break;
        default:
            return new Error("Unsupported authentication method: " + auth.method);
    }

    return false;
};

function isInvalidLayergroup(layergroup) {
    if (!layergroup) {
        return new Error('Missing layergroup');
    }

    var layers = layergroup.layers;

    if (!_.isArray(layers) || layers.length === 0) {
        return new Error('Missing or empty layers array from layergroup config');
    }

    var invalidLayers = layers
        .map(function(layer, layerIndex) {
            return layer.options ? null : layerIndex;
        })
        .filter(function(layerIndex) {
            return layerIndex !== null;
        });

    if (invalidLayers.length) {
        return new Error('Missing `options` in layergroup config for layers: ' + invalidLayers.join(', '));
    }

    return false;
}

function templateDefaults(template) {
    var templateAuth = _.defaults({}, template.auth || {}, {
        method: 'open'
    });
    return _.defaults({ auth: templateAuth }, template, {
        placeholders: {}
    });
}

//--------------- PUBLIC API -------------------------------------

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
TemplateMaps.prototype.addTemplate = function(owner, template, callback) {
    var self = this;

    template = templateDefaults(template);

    var invalidError = this._checkInvalidTemplate(template);
    if ( invalidError ) {
        return callback(invalidError);
    }

    var templateName = template.name;
    var userTemplatesKey = this.key_usr_tpl({ owner:owner });
    var limit = this._userTemplateLimit();

    step(
        function checkLimit() {
            if ( ! limit ) {
                return 0;
            }
            self._redisCmd('HLEN', [ userTemplatesKey ], this);
        },
        function installTemplateIfDoesNotExist(err, numberOfTemplates) {
            assert.ifError(err);
            if ( limit && numberOfTemplates >= limit ) {
                var limitReachedError = new Error("User '" + owner + "' reached limit on number of templates (" +
                    numberOfTemplates + "/" + limit + ")");
                limitReachedError.http_status = 409;
                throw limitReachedError;
            }
            self._redisCmd('HSETNX', [ userTemplatesKey, templateName, JSON.stringify(template) ], this);
        },
        function validateInstallation(err, wasSet) {
            assert.ifError(err);
            if ( ! wasSet ) {
                throw new Error("Template '" + templateName + "' of user '" + owner + "' already exists");
            }

            return true;
        },
        function finish(err) {
            if (!err) {
                self.emit('add', owner, templateName, template);
            }

            callback(err, templateName, template);
        }
  );
};

// Delete a template
//
// @param owner cartodb username of the template owner
//
// @param tpl_id template identifier as returned
//        by addTemplate or listTemplates
//
// @param callback function(err)
//
TemplateMaps.prototype.delTemplate = function(owner, tpl_id, callback) {
    var self = this;
    step(
        function deleteTemplate() {
            self._redisCmd('HDEL', [ self.key_usr_tpl({ owner:owner }), tpl_id ], this);
        },
        function handleDeletion(err, deleted) {
            assert.ifError(err);
            if (!deleted) {
                throw new Error("Template '" + tpl_id + "' of user '" + owner + "' does not exist");
            }
            return true;
        },
        function finish(err) {
            if (!err) {
                self.emit('delete', owner, tpl_id);
            }

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
TemplateMaps.prototype.updTemplate = function(owner, tpl_id, template, callback) {

    var self = this;

    template = templateDefaults(template);

    var invalidError = this._checkInvalidTemplate(template);

    if ( invalidError ) {
        return callback(invalidError);
    }

    var templateName = template.name;

    if ( tpl_id !== templateName ) {
        return callback(new Error("Cannot update name of a map template ('" + tpl_id + "' != '" + templateName + "')"));
    }

    var userTemplatesKey = this.key_usr_tpl({ owner:owner });

    var previousTemplate = null;

    step(
        function getExistingTemplate() {
            self._redisCmd('HGET', [ userTemplatesKey, tpl_id ], this);
        },
        function updateTemplate(err, _currentTemplate) {
            assert.ifError(err);
            if (!_currentTemplate) {
                throw new Error("Template '" + tpl_id + "' of user '" + owner + "' does not exist");
            }
            previousTemplate = _currentTemplate;
            self._redisCmd('HSET', [ userTemplatesKey, templateName, JSON.stringify(template) ], this);
        },
        function handleTemplateUpdate(err, didSetNewField) {
            assert.ifError(err);
            if (didSetNewField) {
                debug('New template created on update operation');
            }
            return true;
        },
        function finish(err) {
            if (!err) {
                if (self.fingerPrint(JSON.parse(previousTemplate)) !== self.fingerPrint(template)) {
                    self.emit('update', owner, templateName, template);
                }
            }

            callback(err, template);
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
TemplateMaps.prototype.listTemplates = function(owner, callback) {
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
TemplateMaps.prototype.getTemplate = function(owner, tpl_id, callback) {
    var self = this;
    step(
        function getTemplate() {
            self._redisCmd('HGET', [ self.key_usr_tpl({owner:owner}), tpl_id ], this);
        },
        function parseTemplate(err, tpl_val) {
            assert.ifError(err);
            return JSON.parse(tpl_val);
        },
        function finish(err, tpl) {
            callback(err, tpl);
        }
    );
};

TemplateMaps.prototype.isAuthorized = function(template, authTokens) {
    if (!template) {
        return false;
    }

    authTokens = _.isArray(authTokens) ? authTokens : [authTokens];

    var templateAuth = template.auth;

    if (!templateAuth) {
        return false;
    }

    if (_.isString(templateAuth) && templateAuth === 'open') {
        return true;
    }

    if (templateAuth.method === 'open') {
        return true;
    }

    if (templateAuth.method === 'token') {
        return _.intersection(templateAuth.valid_tokens, authTokens).length > 0;
    }

    return false;
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
var _reNumber = /^([-+]?[\d\.]?\d+([eE][+-]?\d+)?)$/,
    _reCSSColorName = /^[a-zA-Z]+$/,
    _reCSSColorVal = /^#[0-9a-fA-F]{3,6}$/;

function _replaceVars (str, params) {
  // Construct regular expressions for each param
  Object.keys(params).forEach(function(k) {
        str = str.replace(new RegExp("<%=\\s*" + k + "\\s*%>", "g"), params[k]);
    });
    return str;
}
function isDictionary(val) {
    return ( _.isObject(val) && !_.isArray(val) && !_.isFunction(val));
}
TemplateMaps.prototype.instance = function(template, params) {
  var all_params = {};
  var phold = template.placeholders || {};
  Object.keys(phold).forEach(function(k) {
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
      if ( typeof(val) !== 'number' && ! val.match(_reNumber) ) {
        throw new Error("Invalid number value for template parameter '" + k + "': " + val);
      }
    }
    else if ( type === 'css_color' ) {
      // check it only contains letters or
      // starts with # and only contains hexdigits
      if ( ! val.match(_reCSSColorName) && ! val.match(_reCSSColorVal) ) {
        throw new Error("Invalid css_color value for template parameter '" + k + "': " + val);
      }
    }
    else if ( type === 'dictionary' ) {
        if (!isDictionary(val)) {
            throw new Error("Invalid dictionary value for template parameter '" + k + "': " + val);
        }
    }
    else {
      // NOTE: should be checked at template create/update time
      throw new Error("Invalid placeholder type '" + type + "'");
    }
    all_params[k] = val;
  });

  // NOTE: we're deep-cloning the layergroup here
  var layergroup = JSON.parse(JSON.stringify(template.layergroup));

  if (typeof layergroup.buffersize === 'string') {
      layergroup.buffersize = Number(_replaceVars(layergroup.buffersize, all_params));
  } else if (isDictionary(layergroup.buffersize)) {
      Object.keys(layergroup.buffersize).forEach(function(k) {
        layergroup.buffersize[k] = Number(_replaceVars(layergroup.buffersize[k], all_params));
      });
  }

  for (var i=0; i<layergroup.layers.length; ++i) {
    var lyropt = layergroup.layers[i].options;

    if ( params.styles && params.styles[i] ) {
        // dynamic styling for this layer
        lyropt.cartocss = params.styles[i];
    } else if ( lyropt.cartocss ) {
        lyropt.cartocss = _replaceVars(lyropt.cartocss, all_params);
    }
    if ( lyropt.sql) {
        lyropt.sql = _replaceVars(lyropt.sql, all_params);
    }
    // Anything else ?
  }

  // extra information about the template
  layergroup.template = {
    name: template.name,
    auth: template.auth
  };

  return layergroup;
};

// Return a fingerPrint of the object
TemplateMaps.prototype.fingerPrint = function(template) {
  return crypto.createHash('md5')
    .update(JSON.stringify(template))
    .digest('hex')
  ;
};

module.exports.templateName = function templateName(templateId) {
    var templateIdTokens = templateId.split('@');
    var name = templateIdTokens[0];

    if (templateIdTokens.length > 1) {
        name = templateIdTokens[1];
    }

    return name;
};
