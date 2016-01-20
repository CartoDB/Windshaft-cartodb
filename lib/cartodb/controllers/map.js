var _ = require('underscore');
var assert = require('assert');
var step = require('step');
var windshaft = require('windshaft');

var util = require('util');
var BaseController = require('./base');

var cors = require('../middleware/cors');
var userMiddleware = require('../middleware/user');

var MapConfig = windshaft.model.MapConfig;
var Datasource = windshaft.model.Datasource;

var NamedMapsCacheEntry = require('../cache/model/named_maps_entry');
var TablesCacheEntry = require('../cache/model/database_tables_entry');

var MapConfigNamedLayersAdapter = require('../models/mapconfig_named_layers_adapter');
var NamedMapMapConfigProvider = require('../models/mapconfig/named_map_provider');
var CreateLayergroupMapConfigProvider = require('../models/mapconfig/create_layergroup_provider');
var OverviewsApi = require('../api/overviews_api');
var MapConfigOverviewsAdapter = require('../models/mapconfig_overviews_adapter');

/**
 * @param {AuthApi} authApi
 * @param {PgConnection} pgConnection
 * @param {TemplateMaps} templateMaps
 * @param {MapBackend} mapBackend
 * @param metadataBackend
 * @param {QueryTablesApi} queryTablesApi
 * @param {SurrogateKeysCache} surrogateKeysCache
 * @param {UserLimitsApi} userLimitsApi
 * @param {LayergroupAffectedTables} layergroupAffectedTables
 * @constructor
 */
function MapController(authApi, pgConnection, templateMaps, mapBackend, metadataBackend, queryTablesApi,
                       surrogateKeysCache, userLimitsApi, layergroupAffectedTables) {

    BaseController.call(this, authApi, pgConnection);

    this.pgConnection = pgConnection;
    this.templateMaps = templateMaps;
    this.mapBackend = mapBackend;
    this.metadataBackend = metadataBackend;
    this.queryTablesApi = queryTablesApi;
    this.overviewsApi = new OverviewsApi(this.queryTablesApi);
    this.surrogateKeysCache = surrogateKeysCache;
    this.userLimitsApi = userLimitsApi;
    this.layergroupAffectedTables = layergroupAffectedTables;

    this.namedLayersAdapter = new MapConfigNamedLayersAdapter(templateMaps);
    this.overviewsAdapter = new MapConfigOverviewsAdapter(this.overviewsApi);
}

util.inherits(MapController, BaseController);

module.exports = MapController;


MapController.prototype.register = function(app) {
    app.get(app.base_url_mapconfig, cors(), userMiddleware, this.createGet.bind(this));
    app.post(app.base_url_mapconfig, cors(), userMiddleware, this.createPost.bind(this));
    app.get(app.base_url_templated + '/:template_id/jsonp', cors(), userMiddleware, this.jsonp.bind(this));
    app.post(app.base_url_templated + '/:template_id', cors(), userMiddleware, this.instantiate.bind(this));
    app.options(app.base_url_mapconfig, cors('Content-Type'));
};

MapController.prototype.createGet = function(req, res){
    req.profiler.start('windshaft.createmap_get');

    this.create(req, res, function createGet$prepareConfig(err, req) {
        assert.ifError(err);
        if ( ! req.params.config ) {
            throw new Error('layergroup GET needs a "config" parameter');
        }
        return JSON.parse(req.params.config);
    });
};

MapController.prototype.createPost = function(req, res) {
    req.profiler.start('windshaft.createmap_post');

    this.create(req, res, function createPost$prepareConfig(err, req) {
        assert.ifError(err);
        if (!req.is('application/json')) {
            throw new Error('layergroup POST data must be of type application/json');
        }
        return req.body;
    });
};

MapController.prototype.instantiate = function(req, res) {
    if (req.profiler) {
        req.profiler.start('windshaft-cartodb.instance_template_post');
    }

    this.instantiateTemplate(req, res, function prepareTemplateParams(callback) {
        if (!req.is('application/json')) {
            return callback(new Error('Template POST data must be of type application/json'));
        }
        return callback(null, req.body);
    });
};

MapController.prototype.jsonp = function(req, res) {
    if (req.profiler) {
        req.profiler.start('windshaft-cartodb.instance_template_get');
    }

    this.instantiateTemplate(req, res, function prepareJsonTemplateParams(callback) {
        var err = null;
        if ( req.query.callback === undefined || req.query.callback.length === 0) {
            err = new Error('callback parameter should be present and be a function name');
        }

        var templateParams = {};
        if (req.query.config) {
            try {
                templateParams = JSON.parse(req.query.config);
            } catch(e) {
                err = new Error('Invalid config parameter, should be a valid JSON');
            }
        }

        return callback(err, templateParams);
    });
};

MapController.prototype.create = function(req, res, prepareConfigFn) {
    var self = this;

    var mapConfig;

    step(
        function setupParams(){
            self.req2params(req, this);
        },
        prepareConfigFn,
        function beforeLayergroupCreate(err, requestMapConfig) {
            assert.ifError(err);
            var next = this;
            self.namedLayersAdapter.getLayers(req.context.user, requestMapConfig.layers, self.pgConnection,
                function(err, layers, datasource) {
                    if (err) {
                        return next(err);
                    }

                    if (layers) {
                        requestMapConfig.layers = layers;
                    }
                    return next(null, requestMapConfig, datasource);
                }
            );
        },
        function addOverviewsInformation(err, requestMapConfig, datasource) {
          assert.ifError(err);
          var next = this;
          self.overviewsAdapter.getLayers(req.context.user, requestMapConfig.layers,
              function(err, layers) {
                  if (err) {
                      return next(err);
                  }

                  if (layers) {
                      requestMapConfig.layers = layers;
                  }
                  return next(null, requestMapConfig, datasource);
              }
          );
        },
        function createLayergroup(err, requestMapConfig, datasource) {
            assert.ifError(err);
            mapConfig = new MapConfig(requestMapConfig, datasource || Datasource.EmptyDatasource());
            self.mapBackend.createLayergroup(
                mapConfig, req.params,
                new CreateLayergroupMapConfigProvider(mapConfig, req.context.user, self.userLimitsApi, req.params),
                this
            );
        },
        function afterLayergroupCreate(err, layergroup) {
            assert.ifError(err);
            self.afterLayergroupCreate(req, res, mapConfig, layergroup, this);
        },
        function finish(err, layergroup) {
            if (err) {
                self.sendError(req, res, err, 'ANONYMOUS LAYERGROUP');
            } else {
                res.set('X-Layergroup-Id', layergroup.layergroupid);
                self.send(req, res, layergroup, 200);
            }
        }
    );
};

MapController.prototype.instantiateTemplate = function(req, res, prepareParamsFn) {
    var self = this;

    var cdbuser = req.context.user;

    var mapConfigProvider;
    var mapConfig;

    step(
        function setupParams(){
            self.req2params(req, this);
        },
        function getTemplateParams() {
            prepareParamsFn(this);
        },
        function getTemplate(err, templateParams) {
            assert.ifError(err);
            mapConfigProvider = new NamedMapMapConfigProvider(
                self.templateMaps,
                self.pgConnection,
                self.userLimitsApi,
                self.queryTablesApi,
                self.namedLayersAdapter,
                cdbuser,
                req.params.template_id,
                templateParams,
                req.query.auth_token,
                req.params
            );
            mapConfigProvider.getMapConfig(this);
        },
        function addOverviewsInformation(err, requestMapConfig, rendererParams/*, context*/) {
          assert.ifError(err);
          var next = this;
          self.overviewsAdapter.getLayers(req.context.user, requestMapConfig.layers,
              function(err, layers) {
                  if (err) {
                      return next(err);
                  }

                  if (layers) {
                      requestMapConfig.layers = layers;
                  }
                  return next(null, requestMapConfig, rendererParams);
              }
          );
        },
        function createLayergroup(err, mapConfig_, rendererParams) {
            assert.ifError(err);
            mapConfig = mapConfig_;
            self.mapBackend.createLayergroup(
                mapConfig, rendererParams,
                new CreateLayergroupMapConfigProvider(mapConfig, cdbuser, self.userLimitsApi, rendererParams),
                this
            );
        },
        function afterLayergroupCreate(err, layergroup) {
            assert.ifError(err);
            self.afterLayergroupCreate(req, res, mapConfig, layergroup, this);
        },
        function finishTemplateInstantiation(err, layergroup) {
            if (err) {
                self.sendError(req, res, err, 'NAMED MAP LAYERGROUP');
            } else {
                var templateHash = self.templateMaps.fingerPrint(mapConfigProvider.template).substring(0, 8);
                layergroup.layergroupid = cdbuser + '@' + templateHash + '@' + layergroup.layergroupid;

                res.set('X-Layergroup-Id', layergroup.layergroupid);
                self.surrogateKeysCache.tag(res, new NamedMapsCacheEntry(cdbuser, mapConfigProvider.getTemplateName()));

                self.send(req, res, layergroup, 200);
            }
        }
    );
};


MapController.prototype.afterLayergroupCreate = function(req, res, mapconfig, layergroup, callback) {
    var self = this;

    var username = req.context.user;

    var tasksleft = 2; // redis key and affectedTables
    var errors = [];

    var done = function(err) {
        if ( err ) {
            errors.push('' + err);
        }
        if ( ! --tasksleft ) {
            err = errors.length ? new Error(errors.join('\n')) : null;
            callback(err, layergroup);
        }
    };

    // include in layergroup response the variables in serverMedata
    // those variables are useful to send to the client information
    // about how to reach this server or information about it
    _.extend(layergroup, global.environment.serverMetadata);

    // Don't wait for the mapview count increment to
    // take place before proceeding. Error will be logged
    // asynchronously
    this.metadataBackend.incMapviewCount(username, mapconfig.obj().stat_tag, function(err) {
        if (req.profiler) {
            req.profiler.done('incMapviewCount');
        }
        if ( err ) {
            global.logger.log("ERROR: failed to increment mapview count for user '" + username + "': " + err);
        }
        done();
    });

    var sql = mapconfig.getLayers().map(function(layer) {
        return layer.options.sql;
    }).join(';');

    var dbName = req.params.dbname;
    var layergroupId = layergroup.layergroupid;

    step(
        function checkCachedAffectedTables() {
            return self.layergroupAffectedTables.hasAffectedTables(dbName, layergroupId);
        },
        function getAffectedTablesAndLastUpdatedTime(err, hasCache) {
            assert.ifError(err);
            if (hasCache) {
                var next = this;
                var affectedTables = self.layergroupAffectedTables.get(dbName, layergroupId);
                self.queryTablesApi.getLastUpdatedTime(username, affectedTables, function(err, lastUpdatedTime) {
                    if (err) {
                        return next(err);
                    }
                    return next(null, { affectedTables: affectedTables, lastUpdatedTime: lastUpdatedTime });
                });
            } else {
                self.queryTablesApi.getAffectedTablesAndLastUpdatedTime(username, sql, this);
            }
        },
        function handleAffectedTablesAndLastUpdatedTime(err, result) {
            if (req.profiler) {
                req.profiler.done('queryTablesAndLastUpdated');
            }
            assert.ifError(err);
            self.layergroupAffectedTables.set(dbName, layergroupId, result.affectedTables);

            // last update for layergroup cache buster
            layergroup.layergroupid = layergroup.layergroupid + ':' + result.lastUpdatedTime;
            layergroup.last_updated = new Date(result.lastUpdatedTime).toISOString();

            // TODO this should take into account several URL patterns
            addWidgetsUrl(username, layergroup);

            if (req.method === 'GET') {
                var tableCacheEntry = new TablesCacheEntry(dbName, result.affectedTables);
                var ttl = global.environment.varnish.layergroupTtl || 86400;
                res.set('Cache-Control', 'public,max-age='+ttl+',must-revalidate');
                res.set('Last-Modified', (new Date()).toUTCString());
                res.set('X-Cache-Channel', tableCacheEntry.getCacheChannel());
                if (result.affectedTables && result.affectedTables.length > 0) {
                    self.surrogateKeysCache.tag(res, tableCacheEntry);
                }
            }

            return null;
        },
        function finish(err) {
            done(err);
        }
    );
};

function addWidgetsUrl(username, layergroup) {

    if (layergroup.metadata && Array.isArray(layergroup.metadata.layers)) {
        layergroup.metadata.layers = layergroup.metadata.layers.map(function(layer, layerIndex) {
            if (layer.widgets) {
                Object.keys(layer.widgets).forEach(function(widgetName) {
                    var resource = layergroup.layergroupid + '/' + layerIndex + '/widget/' + widgetName;
                    layer.widgets[widgetName].url = getUrls(username, resource);
                });
            }
            return layer;
        });
    }

}

function getUrls(username, resource) {
    var cdnUrl = global.environment.serverMetadata && global.environment.serverMetadata.cdn_url;
    if (cdnUrl) {
        return {
            http: 'http://' + cdnUrl.http + '/' + username + '/api/v1/map/' + resource,
            https: 'https://' + cdnUrl.https + '/' + username + '/api/v1/map/' + resource
        };
    } else {
        var port = global.environment.port;
        return {
            http: 'http://' + username + '.' + 'localhost.lan:' + port +  '/api/v1/map/' + resource
        };
    }
}
