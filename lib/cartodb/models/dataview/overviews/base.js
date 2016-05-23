var _ = require('underscore');
var BaseWidget = require('../base');

function BaseOverviewsDataview() {}

module.exports = BaseOverviewsDataview;

BaseOverviewsDataview.prototype = new BaseWidget();
BaseOverviewsDataview.prototype.constructor = BaseOverviewsDataview;

var zoomLevelFactor = 100.0;

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
      var z = Math.ceil(-Math.log(maxDim*pxPerTile/earthWidth/zoomLevelFactor)/Math.log(2.0));
      return Math.max(z, 0);
    }
    return 0;
};
