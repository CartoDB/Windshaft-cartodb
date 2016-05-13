var parentFactory = require('../factory');
var dataviews = require('./');

function OverviewsDataviewFactory(queryRewriter, queryRewriteData) {
    this.queryRewriter = queryRewriter;
    this.queryRewriteData = queryRewriteData;
}

OverviewsDataviewFactory.prototype.getDataview = function(query, dataviewDefinition) {
    var type = dataviewDefinition.type;
    var dataviews = OverviewsDataviewMetaFactory.dataviews;
    if ( !this.queryRewriter || !this.queryRewriteData || !dataviews[type] ) {
        return parentFactory.getDataview(query, dataviewDefinition);
    }
    return new dataviews[type](query, dataviewDefinition.options, this.queryRewriter, this.queryRewriteData);
};

var OverviewsDataviewMetaFactory = {
    dataviews: Object.keys(dataviews).reduce(function(allDataviews, dataviewClassName) {
        allDataviews[dataviewClassName.toLowerCase()] = dataviews[dataviewClassName];
        return allDataviews;
    }, {}),

    getFactory: function(queryRewriter, queryRewriteData) {
        return new OverviewsDataviewFactory(queryRewriter, queryRewriteData);
    },
};

module.exports = OverviewsDataviewMetaFactory;
