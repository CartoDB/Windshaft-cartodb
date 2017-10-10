const dataviews = require('./');

module.exports = class DataviewFactory {
    static get dataviews() {
        return Object.keys(dataviews).reduce((allDataviews, dataviewClassName) => {
            allDataviews[dataviewClassName.toLowerCase()] = dataviews[dataviewClassName];
            return allDataviews;
        }, {});
    }

    static getDataview (query, dataviewDefinition) {
        const { type, options, sql } = dataviewDefinition;

        if (!this.dataviews[type]) {
            throw new Error('Invalid dataview type: "' + type + '"');
        }

        return new this.dataviews[type](query, options, sql);
    }
};
