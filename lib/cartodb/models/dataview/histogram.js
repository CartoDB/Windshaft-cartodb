const debug = require('debug')('windshaft:dataview:histogram');
const NumericHistogram = require('./numeric-histogram');
const DateHistogram = require('./date-histogram');

const TYPE = 'histogram';
const DATE_HISTOGRAM = 'DateHistogram';
const NUMERIC_HISTOGRAM = 'NumericHistogram';

module.exports = class Histogram {
    constructor (query, options, queries) {
        switch (this._getHistogramSubtype(options)) {
            case DATE_HISTOGRAM:
                debug('Delegating to DateHistogram with options: %j', options)
                this.dataview = new DateHistogram(query, options, queries);
                break;
            case NUMERIC_HISTOGRAM:
                debug('Delegating to NumericHistogram with options: %j', options)
                this.dataview = new NumericHistogram(query, options, queries);
                break;
        
            default:
                throw new Error('Unsupported Histogram type');
        }
    }

    _getHistogramSubtype (options) {
        if(options.bins && !options.aggregation) {
            return NUMERIC_HISTOGRAM
        } else if(options.aggregation && !options.bins) {
            return DATE_HISTOGRAM
        }
    }

    getResult (psql, override, callback) {
        this.dataview.getResult(psql, override, callback);
    }
};
