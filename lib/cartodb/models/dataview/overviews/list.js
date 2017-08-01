var BaseOverviewsDataview = require('./base');
var BaseDataview = require('../list');

function List(query, options, queryRewriter, queryRewriteData, params, queries) {
    BaseOverviewsDataview.call(this, query, options, BaseDataview, queryRewriter, queryRewriteData, params, queries);
}

List.prototype = Object.create(BaseOverviewsDataview.prototype);
List.prototype.constructor = List;

module.exports = List;
