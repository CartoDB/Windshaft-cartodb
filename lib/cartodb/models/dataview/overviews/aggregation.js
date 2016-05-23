var BaseOverviewsWidget = require('./base');
var BaseDataview = require('../aggregation');

function Aggregation(query, options, queryRewriter, queryRewriteData, params) {
    BaseOverviewsWidget.call(this, query, options, BaseDataview, queryRewriter, queryRewriteData, params);
}

Aggregation.prototype = Object.create(BaseOverviewsWidget.prototype);
Aggregation.prototype.constructor = Aggregation;

module.exports = Aggregation;
