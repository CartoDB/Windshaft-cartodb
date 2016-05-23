var BaseOverviewsWidget = require('./base');
var BaseDataview = require('../histogram');

function Histogram(query, options, queryRewriter, queryRewriteData, params) {
    BaseOverviewsWidget.call(this, query, options, BaseDataview, queryRewriter, queryRewriteData, params);
}

Histogram.prototype = Object.create(BaseOverviewsWidget.prototype);
Histogram.prototype.constructor = Histogram;

module.exports = Histogram;
