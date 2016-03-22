var dataviews = require('./');

var DataviewFactory = {
    dataviews: Object.keys(dataviews).reduce(function(allDataviews, dataviewClassName) {
        allDataviews[dataviewClassName.toLowerCase()] = dataviews[dataviewClassName];
        return allDataviews;
    }, {}),

    getDataview: function(query, dataviewDefinition) {
        var type = dataviewDefinition.type;
        if (!this.dataviews[type]) {
            throw new Error('Invalid dataview type: "' + type + '"');
        }
        return new this.dataviews[type](query, dataviewDefinition.options);
    }
};

module.exports = DataviewFactory;
