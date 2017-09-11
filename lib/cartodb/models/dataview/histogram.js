const debug = require('debug')('windshaft:dataview:histogram');
const NumericHistogram = require('./histograms/numeric-histogram');
const DateHistogram = require('./histograms/date-histogram');

const DATE_HISTOGRAM = 'DateHistogram';
const NUMERIC_HISTOGRAM = 'NumericHistogram';

module.exports = class Histogram {
    constructor (query, options, queries) {
        this.query = query;
        this.options = options || {};
        this.queries = queries;

        this.dataview = this._getHistogramImplementation();
    }

    _getHistogramImplementation (override) {
        let implementation = null;

        switch (this._getHistogramSubtype(override)) {
            case DATE_HISTOGRAM:
                debug('Delegating to DateHistogram with options: %j and overriding: %j', this.options, override);
                implementation = new DateHistogram(this.query, this.options, this.queries);
                break;
            case NUMERIC_HISTOGRAM:
                debug('Delegating to NumericHistogram with options: %j and overriding: %j', this.options, override);
                implementation = new NumericHistogram(this.query, this.options, this.queries);
                break;
            default:
                throw new Error('Unsupported Histogram type');
        }

        return implementation;
    }

    _getHistogramSubtype (override = {}) {
        if(this.options.aggregation !== undefined || override.aggregation !== undefined) {
            return DATE_HISTOGRAM;
        }
        return NUMERIC_HISTOGRAM;
    }

    getResult (psql, override, callback) {
        this.dataview = this._getHistogramImplementation(override);
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
