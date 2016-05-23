var BaseOverviewsWidget = require('./base');
var BaseDataview = require('../list');

function List(query, options, queryRewriter, queryRewriteData, params) {
    BaseOverviewsWidget.call(this, query, options, BaseDataview, queryRewriter, queryRewriteData, params);
}

List.prototype = Object.create(BaseOverviewsWidget.prototype);
List.prototype.constructor = List;

module.exports = List;
