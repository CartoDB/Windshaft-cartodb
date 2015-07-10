var _ = require('underscore');
var assert = require('assert');
var step = require('step');
var windshaft = require('windshaft');

var cors = require('../middleware/cors');

var MapConfig = windshaft.model.MapConfig;
var Datasource = windshaft.model.Datasource;

var NamedMapsCacheEntry = require('../cache/model/named_maps_entry');

var MapConfigNamedLayersAdapter = require('../models/mapconfig_named_layers_adapter');
var NamedMapMapConfigProvider = require('../models/mapconfig/named_map_provider');

/**
 * @param app
 * @param {PgConnection} pgConnection
 * @param {TemplateMaps} templateMaps
 * @param {MapBackend} mapBackend
 * @param metadataBackend
 * @param {QueryTablesApi} queryTablesApi
 * @param {SurrogateKeysCache} surrogateKeysCache
 * @constructor
 */
function MapController(app, pgConnection, templateMaps, mapBackend, metadataBackend, queryTablesApi,
                       surrogateKeysCache) {
    this.app = app;
    this.pgConnection = pgConnection;
    this.templateMaps = templateMaps;
    this.mapBackend = mapBackend;
    this.metadataBackend = metadataBackend;
    this.queryTablesApi = queryTablesApi;
    this.surrogateKeysCache = surrogateKeysCache;
    this.namedLayersAdapter = new MapConfigNamedLayersAdapter(templateMaps);
}

module.exports = MapController;


MapController.prototype.register = function(app) {
    app.get(app.base_url_mapconfig, cors(), this.createGet.bind(this));
    app.post(app.base_url_mapconfig, cors(), this.createPost.bind(this));
    app.get(app.base_url_templated + '/:template_id/jsonp', cors(), this.jsonp.bind(this));
    app.post(app.base_url_templated + '/:template_id', cors(), this.instantiate.bind(this));
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
            self.app.req2params(req, this);
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
        function createLayergroup(err, requestMapConfig, datasource) {
            assert.ifError(err);
            mapConfig = new MapConfig(requestMapConfig, datasource || Datasource.EmptyDatasource());
            self.mapBackend.createLayergroup(mapConfig, req.params, this);
        },
        function afterLayergroupCreate(err, layergroup) {
            assert.ifError(err);
            self.afterLayergroupCreate(req, mapConfig, layergroup, this);
        },
        function finish(err, layergroup) {
            if (err) {
                var statusCode = self.app.findStatusCode(err);
                self.app.sendError(res, { errors: [ err.message ] }, statusCode, 'ANONYMOUS LAYERGROUP', err);
            } else {
                self.app.sendResponse(res, [layergroup, 200]);
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
        function getTemplateParams() {
            prepareParamsFn(this);
        },
        function getTemplate(err, templateParams) {
            assert.ifError(err);
            mapConfigProvider = new NamedMapMapConfigProvider(
                self.templateMaps,
                self.pgConnection,
                cdbuser,
                req.params.template_id,
                templateParams,
                req.query.auth_token,
                req.params
            );
            mapConfigProvider.getMapConfig(this);
        },
        function createLayergroup(err, mapConfig_, rendererParams/*, context*/) {
            assert.ifError(err);
            mapConfig = mapConfig_;
            self.mapBackend.createLayergroup(mapConfig, rendererParams, this);
        },
        function afterLayergroupCreate(err, layergroup) {
            assert.ifError(err);
            self.afterLayergroupCreate(req, mapConfig, layergroup, this);
        },
        function finishTemplateInstantiation(err, layergroup) {
            if (err) {
                var statusCode = self.app.findStatusCode(err);
                self.app.sendError(res, { errors: [ err.message ] }, statusCode, 'NAMED MAP LAYERGROUP', err);
            } else {
                var templateHash = self.templateMaps.fingerPrint(mapConfigProvider.template).substring(0, 8);
                layergroup.layergroupid = cdbuser + '@' + templateHash + '@' + layergroup.layergroupid;

                res.header('X-Layergroup-Id', layergroup.layergroupid);
                self.surrogateKeysCache.tag(res, new NamedMapsCacheEntry(cdbuser, mapConfigProvider.getTemplateName()));

                self.app.sendResponse(res, [layergroup, 200]);
            }
        }
    );
};


MapController.prototype.afterLayergroupCreate = function(req, mapconfig, layergroup, callback) {
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
            console.log("ERROR: failed to increment mapview count for user '" + username + "': " + err);
        }
        done();
    });

    var sql = mapconfig.getLayers().map(function(layer) {
        return layer.options.sql;
    }).join(';');

    var dbName = req.params.dbname;
    var cacheKey = dbName + ':' + layergroup.layergroupid;

    step(
        function getAffectedTablesAndLastUpdatedTime() {
            self.queryTablesApi.getAffectedTablesAndLastUpdatedTime(username, sql, this);
        },
        function handleAffectedTablesAndLastUpdatedTime(err, result) {
            if (req.profiler) {
                req.profiler.done('queryTablesAndLastUpdated');
            }
            assert.ifError(err);
            var cacheChannel = self.app.buildCacheChannel(dbName, result.affectedTables);
            self.app.channelCache[cacheKey] = cacheChannel;

            // last update for layergroup cache buster
            layergroup.layergroupid = layergroup.layergroupid + ':' + result.lastUpdatedTime;
            layergroup.last_updated = new Date(result.lastUpdatedTime).toISOString();

            var res = req.res;
            if (res) {
                if (req.method === 'GET') {
                    var ttl = global.environment.varnish.layergroupTtl || 86400;
                    res.header('Cache-Control', 'public,max-age='+ttl+',must-revalidate');
                    res.header('Last-Modified', (new Date()).toUTCString());
                    res.header('X-Cache-Channel', cacheChannel);
                }

                res.header('X-Layergroup-Id', layergroup.layergroupid);
            }

            return null;
        },
        function finish(err) {
            done(err);
        }
    );
};
