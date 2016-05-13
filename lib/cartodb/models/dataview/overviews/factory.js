var parentFactory = require('../factory');
var dataviews = require('./');

function OverviewsDataviewFactory(queryRewriter, queryRewriteData, options) {
    this.queryRewriter = queryRewriter;
    this.queryRewriteData = queryRewriteData;
    this.options = options;
}

OverviewsDataviewFactory.prototype.getDataview = function(query, dataviewDefinition) {
    var type = dataviewDefinition.type;
    var dataviews = OverviewsDataviewMetaFactory.dataviews;
    if ( !this.queryRewriter || !this.queryRewriteData || !dataviews[type] ) {
        return parentFactory.getDataview(query, dataviewDefinition);
    }
    return new dataviews[type](
        query, dataviewDefinition.options, this.queryRewriter, this.queryRewriteData, this.options
    );
};

var OverviewsDataviewMetaFactory = {
    dataviews: Object.keys(dataviews).reduce(function(allDataviews, dataviewClassName) {
        allDataviews[dataviewClassName.toLowerCase()] = dataviews[dataviewClassName];
        return allDataviews;
    }, {}),

    getFactory: function(queryRewriter, queryRewriteData, options) {
        return new OverviewsDataviewFactory(queryRewriter, queryRewriteData, options);
    },
};

module.exports = OverviewsDataviewMetaFactory;
