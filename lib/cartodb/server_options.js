var   _          = require('underscore')
    , Step       = require('step')
    , cartoData  = require('./carto_data');

module.exports = function(){
    var me = {
        base_url: '/tiles/:table',
        grainstore: {datasource: global.environment.postgres},
        redis: global.environment.redis
};

/**
 * Whitelist input and get database name & default geometry type from
 * subdomain/user metadata held in CartoDB Redis
 * @param req - standard express request obj. Should have host & table
 * @param callback
 */
me.req2params = function(req, callback){

    // Whitelist query parameters and attach format
    var good_query = ['sql', 'geom_type', 'cache_buster','callback', 'interactivity'];
    var bad_query  = _.difference(_.keys(req.query), good_query);

    _.each(bad_query, function(key){ delete req.query[key]; });
    req.params =  _.extend({}, req.params); // shuffle things as request is a strange array/object

    // bring all query values onto req.params object
    _.extend(req.params, req.query);

    // for cartodb, ensure interactivity is cartodb_id or user specified
    req.params.interactivity = req.params.interactivity || 'cartodb_id';

    // configure styles
    this.grainstore.styles = {
            point: '#' + req.params.table + " {marker-fill: #FF6600;marker-opacity: 1;marker-width: 8;marker-line-color: white;marker-line-width: 3;marker-line-opacity: 0.9;marker-placement: point;marker-type: ellipse;marker-allow-overlap: true;}",
            polygon: '#' + req.params.table + " {polygon-fill: #FF6600;polygon-opacity: 0.7;}" ,
            multipolygon: '#' + req.params.table + " {polygon-fill: #FF6600;polygon-opacity: 0.7;}"
        };

    Step(
        function getDatabase(){
            cartoData.getDatabase(req, this);
        },
        function getGeometryType(err, data){
            if (err) throw err;
            _.extend(req.params, {dbname:data});

            cartoData.getGeometryType(req, this);
        },
        function finishSetup(err, data){
            if (err) throw err;
            if (!_.isNull(data))
                _.extend(req.params, {geom_type: data});

            callback(err, req);
        }
    );
};

/**
 * Little helper method to get the current list of infowindow variables and return to client
 * @param req
 * @param callback
 */
me.getInfowindow = function(req, callback){
    var that = this;

    Step(
        function(){
            that.req2params(req, this);
        },
        function(err, data){
            if (err) throw err;
            cartoData.getInfowindow(data, callback);
        }
    );
};

return me;
}();