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

    // In order to keep previous behaviour with overviews,
    // we have to expose the following methods to bypass
    // the concrete overview implementation

    sql (psql, override, callback) {
        this.dataview.sql(psql, override, callback);
    }

    format (result, override) {
        return this.dataview.format(result, override);
    }

    getType () {
        return this.dataview.getType();
    }

    toString () {
        return this.dataview.toString();
    }
};
