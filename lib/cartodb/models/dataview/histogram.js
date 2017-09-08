const debug = require('debug')('windshaft:dataview:histogram');
const NumericHistogram = require('./numeric-histogram');
const DateHistogram = require('./date-histogram');

const TYPE = 'histogram';
const DATE_HISTOGRAM = 'DateHistogram';
const NUMERIC_HISTOGRAM = 'NumericHistogram';

module.exports = class Histogram {
    constructor (query, options = {}, queries) {
        this.query = query;
        this.options = options;
        this.queries = queries;

        this.dataview = this._getHistogramImplemetation();
    }

    _getHistogramImplemetation (override) {
        switch (this._getHistogramSubtype(override)) {
            case DATE_HISTOGRAM:
                debug('Delegating to DateHistogram with options: %j and overriding: %j', this.options, override)
                return new DateHistogram(this.query, this.options, this.queries);
                break;
            case NUMERIC_HISTOGRAM:
                debug('Delegating to NumericHistogram with options: %j and overriding: %j', this.options, override)
                return new NumericHistogram(this.query, this.options, this.queries);
                break;
            default:
                throw new Error('Unsupported Histogram type');
        }
    } 
    
    _getHistogramSubtype (override = {}) {
        if(this.options.aggregation !== undefined || override.aggregation !== undefined) {
            return DATE_HISTOGRAM;
        }
        return NUMERIC_HISTOGRAM;
    }
    
    getResult (psql, override, callback) {
        this.dataview = this._getHistogramImplemetation(override);
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
