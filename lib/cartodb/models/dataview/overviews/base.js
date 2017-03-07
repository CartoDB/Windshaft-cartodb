var _ = require('underscore');
var BaseDataview = require('../base');

function BaseOverviewsDataview(query, queryOptions, BaseDataview, queryRewriter, queryRewriteData, options) {
  this.BaseDataview = BaseDataview;
  this.query = query;
  this.queryOptions = queryOptions;
  this.queryRewriter = queryRewriter;
  this.queryRewriteData = queryRewriteData;
  this.options = options;
  this.baseDataview = new this.BaseDataview(this.query, this.queryOptions);
}

module.exports = BaseOverviewsDataview;

BaseOverviewsDataview.prototype = new BaseDataview();
BaseOverviewsDataview.prototype.constructor = BaseOverviewsDataview;

// TODO: parameterized these settings
var SETTINGS = {
    // use overviews as a default fallback strategy
    defaultOverviews: false,

    // minimum ratio of bounding box size to grid size
    // (this would ideally be based on the viewport size in pixels)
    zoomLevelFactor: 1024.0
};

// Compute zoom level so that the the resolution grid size of the
// selected overview is smaller (zoomLevelFactor times smaller at least)
// than the bounding box size.
BaseOverviewsDataview.prototype.zoomLevelForBbox = function(bbox) {
    var pxPerTile = 256.0;
    var earthWidth = 360.0;
    // TODO: now we assume overviews are computed for 1-pixel tolerance;
    // should use extended overviews metadata to compute this properly.
    if ( bbox ) {
      var bboxValues = _.map(bbox.split(','), function(v) { return +v; });
      var w = Math.abs(bboxValues[2]-bboxValues[0]);
      var h = Math.abs(bboxValues[3]-bboxValues[1]);
      var maxDim = Math.min(w, h);

      // Find minimum suitable z
      // note that the QueryRewirter will use the minimum level overview
      // of level >= z if it exists, and otherwise the base table
      var z = Math.ceil(-Math.log(maxDim*pxPerTile/earthWidth/SETTINGS.zoomLevelFactor)/Math.log(2.0));
      return Math.max(z, 0);
    }
    return 0;
};

BaseOverviewsDataview.prototype.rewrittenQuery = function(query) {
    var zoom_level = this.zoomLevelForBbox(this.options.bbox);
    return this.queryRewriter.query(query, this.queryRewriteData, { zoom_level: zoom_level });
};

// Default behaviour
BaseOverviewsDataview.prototype.defaultSql = function(psql, override, callback) {
    var query = this.query;
    var dataview = this.baseDataview;
    if ( SETTINGS.defaultOverviews ) {
        query = this.rewrittenQuery(query);
        dataview = new this.BaseDataview(query, this.queryOptions);
    }
    return dataview.sql(psql, override, callback);
};

// default implementation that can be override in derived classes:

BaseOverviewsDataview.prototype.sql = function(psql, override, callback) {
    return this.defaultSql(psql, override, callback);
};

BaseOverviewsDataview.prototype.search = function(psql, userQuery, callback) {
    return this.baseDataview.search(psql, userQuery, callback);
};

BaseOverviewsDataview.prototype.format = function(result) {
    return this.baseDataview.format(result);
};

BaseOverviewsDataview.prototype.getType = function() {
    return this.baseDataview.getType();
};

BaseOverviewsDataview.prototype.toString = function() {
    return this.baseDataview.toString();
};
