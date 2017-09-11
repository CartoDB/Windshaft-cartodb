const BaseDataview = require('../base');

const TYPE = 'histogram';

module.exports = class BaseHistogram extends BaseDataview {
    constructor (query, options, queries) {
        super();

        if (typeof options.column !== 'string') {
            throw new Error('Histogram expects `column` in widget options');
        }

        this.query = query;
        this.queries = queries;
        this.column = options.column;
        this.bins = options.bins;

        this._columnType = null;
    }

    sql (psql, override, callback) {
        if (!callback) {
            callback = override;
            override = {};
        }

        if (this._columnType === null) {
            this.getColumnType(psql, this.column, this.queries.no_filters, (err, type) => {
                // assume numeric, will fail later
                this._columnType = 'numeric';
                if (!err && !!type) {
                    this._columnType = Object.keys(type).find(function (key) {
                        return type[key];
                    });
                }
                this.sql(psql, override, callback);
            }, true); // use read-only transaction
            return null;
        }

        return this._buildQuery(psql, override, callback);
    }

    format (result, override) {
        const histogram = this._getSummary(result, override);
        histogram.bins = this._getBuckets(result);
        return histogram;
    }

    getType () {
        return TYPE;
    }

    toString () {
        return JSON.stringify({
            _type: TYPE,
            _column: this.column,
            _query: this.query
        });
    }

    _getBinStart (override = {}) {
        if (override.hasOwnProperty('start') && override.hasOwnProperty('end')) {
            return Math.min(override.start, override.end);
        }
        return override.start || 0;
    }

    _getBinEnd (override = {}) {
        if (override.hasOwnProperty('start') && override.hasOwnProperty('end')) {
            return Math.max(override.start, override.end);
        }
        return override.end || 0;
    }

    _getBinsCount (override = {}) {
        return override.bins || 0;
    }
};