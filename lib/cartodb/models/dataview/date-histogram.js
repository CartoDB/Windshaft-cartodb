const BaseDataview = require('./base');
const debug = require('debug')('windshaft:dataview:date-histogram');

const dateIntervalQueryTpl = ctx => `
    WITH
    __cdb_dates AS (
        SELECT
            MAX(${ctx.column}::timestamp) AS __cdb_end,
            MIN(${ctx.column}::timestamp) AS __cdb_start
        FROM (${ctx.query}) __cdb_source
    ),
    __cdb_interval_in_days AS (
        SELECT
            DATE_PART('day', __cdb_end - __cdb_start) AS __cdb_days
        FROM __cdb_dates
    ),
    __cdb_interval_in_hours AS (
        SELECT
            __cdb_days * 24 + DATE_PART('hour', __cdb_end - __cdb_start) AS __cdb_hours
        FROM __cdb_interval_in_days, __cdb_dates
    ),
    __cdb_interval_in_minutes AS (
        SELECT
            __cdb_hours * 60 + DATE_PART('minute', __cdb_end - __cdb_start) AS __cdb_minutes
        FROM __cdb_interval_in_hours, __cdb_dates
    ),
    __cdb_interval_in_seconds AS (
        SELECT
            __cdb_minutes * 60 + DATE_PART('second', __cdb_end - __cdb_start) AS __cdb_seconds
        FROM __cdb_interval_in_minutes, __cdb_dates
    )
    SELECT
        ROUND(__cdb_days / 365) AS year,
        ROUND(__cdb_days / 90) AS quarter,
        ROUND(__cdb_days / 30) AS month,
        ROUND(__cdb_days / 7) AS week,
        __cdb_days AS day,
        __cdb_hours AS hour,
        __cdb_minutes AS minute,
        __cdb_seconds AS second
    FROM __cdb_interval_in_days, __cdb_interval_in_hours, __cdb_interval_in_minutes, __cdb_interval_in_seconds
`;

const nullsQueryTpl = ctx => `
    __cdb_nulls AS (
        SELECT
            count(*) AS __cdb_nulls_count
        FROM (${ctx._query}) __cdb_histogram_nulls
        WHERE ${ctx._column} IS NULL
    )
`;

const dateBasicsQueryTpl = ctx => `
    __cdb_basics AS (
        SELECT
            max(date_part('epoch', ${ctx._column})) AS __cdb_max_val,
            min(date_part('epoch', ${ctx._column})) AS __cdb_min_val,
            avg(date_part('epoch', ${ctx._column})) AS __cdb_avg_val,
            min(
                date_trunc(
                    '${ctx._aggregation}', ${ctx._column}::timestamp AT TIME ZONE '${ctx._offset}'
                )
            ) AS __cdb_start_date,
            max(${ctx._column}::timestamp AT TIME ZONE '${ctx._offset}') AS __cdb_end_date,
            count(1) AS __cdb_total_rows
        FROM (${ctx._query}) __cdb_basics_query
    )
`;

const dateOverrideBasicsQueryTpl = ctx => `
    __cdb_basics AS (
        SELECT
            max(${ctx._end}) AS __cdb_max_val,
            min(${ctx._start}) AS __cdb_min_val,
            avg(date_part('epoch', ${ctx._column})) AS __cdb_avg_val,
            min(
                date_trunc(
                    '${ctx._aggregation}',
                    TO_TIMESTAMP(${ctx._start})::timestamp AT TIME ZONE '${ctx._offset}'
                )
            ) AS __cdb_start_date,
            max(
                TO_TIMESTAMP(${ctx._end})::timestamp AT TIME ZONE '${ctx._offset}'
            ) AS __cdb_end_date,
            count(1) AS __cdb_total_rows
        FROM (${ctx._query}) __cdb_basics_query
    )
`;

const dateBinsQueryTpl = ctx => `
    __cdb_bins AS (
        SELECT
            __cdb_bins_array,
            ARRAY_LENGTH(__cdb_bins_array, 1) AS __cdb_bins_number
        FROM (
            SELECT
                ARRAY(
                    SELECT GENERATE_SERIES(
                        __cdb_start_date::timestamptz,
                        __cdb_end_date::timestamptz,
                        ${ctx._aggregation === 'quarter' ? `'3 month'::interval` : `'1 ${ctx._aggregation}'::interval`}
                    )
                ) AS __cdb_bins_array
            FROM __cdb_basics
        ) __cdb_bins_array_query
    )
`;

const dateHistogramQueryTpl = ctx => `
    SELECT
        (__cdb_max_val - __cdb_min_val) / cast(__cdb_bins_number as float) AS bin_width,
        __cdb_bins_number AS bins_number,
        __cdb_nulls_count AS nulls_count,
        CASE WHEN __cdb_min_val = __cdb_max_val
        THEN 0
        ELSE GREATEST(
            1,
            LEAST(
                WIDTH_BUCKET(
                    ${ctx._column}::timestamp AT TIME ZONE '${ctx._offset}',
                    __cdb_bins_array
                ),
                __cdb_bins_number
            )
        ) - 1
        END AS bin,
        min(
            date_part(
                'epoch',
                date_trunc(
                    '${ctx._aggregation}', ${ctx._column}::timestamp AT TIME ZONE '${ctx._offset}'
                ) AT TIME ZONE '${ctx._offset}'
            )
        )::numeric AS timestamp,
        date_part('epoch', __cdb_start_date)::numeric AS timestamp_start,
        min(date_part('epoch', ${ctx._column}))::numeric AS min,
        max(date_part('epoch', ${ctx._column}))::numeric AS max,
        avg(date_part('epoch', ${ctx._column}))::numeric AS avg,
        count(*) AS freq
    FROM (${ctx._query}) __cdb_histogram, __cdb_basics, __cdb_bins, __cdb_nulls
    WHERE date_part('epoch', ${ctx._column}) IS NOT NULL
    GROUP BY bin, bins_number, bin_width, nulls_count, timestamp_start
    ORDER BY bin
`;

const MAX_INTERVAL_VALUE = 366;

const TYPE = 'histogram';

const DATE_AGGREGATIONS = {
    'auto': true,
    'minute': true,
    'hour': true,
    'day': true,
    'week': true,
    'month': true,
    'quarter': true,
    'year': true
};

/**
    date_histogram: {
        type: 'histogram',
        options: {
            column: 'date', // column data type: date
            aggregation: 'day' // auto by default
            offset: -7200 // OPTIONAL (UTC offset in seconds)
        }
    }
*/
module.exports = class DateHistogram extends BaseDataview {
    constructor (query, options, queries) {
        super();

        if (typeof options.column !== 'string') {
            throw new Error('Histogram expects `column` in widget options');
        }

        this.query = query;
        this.queries = queries;
        this.column = options.column;
        this.bins = options.bins;
        this.aggregation = options.aggregation;
        this.offset = options.offset;

        this._columnType = null;
    }

    sql (psql, override, callback) {
        var self = this;

        if (!callback) {
            callback = override;
            override = {};
        }

        if (this._columnType === null) {
            this.getColumnType(psql, this.column, this.queries.no_filters, function (err, type) {
                // assume numeric, will fail later
                self._columnType = 'numeric';
                if (!err && !!type) {
                    self._columnType = Object.keys(type).find(function (key) {
                        return type[key];
                    });
                }
                self.sql(psql, override, callback);
            }, true); // use read-only transaction
            return null;
        }

        if (this.isDateHistogram(override)) {
            return this._buildQuery(psql, override, callback);
        }

    }

    isDateHistogram (override) {
        return this._columnType === 'date' && (this.aggregation !== undefined || override.aggregation !== undefined);
    }

    buildDateHistogramQueryTpl (ctx) {
        return `
            WITH
            ${ctx._override && ctx._override.hasOwnProperty('start') && ctx._override.hasOwnProperty('end') ?
                dateOverrideBasicsQueryTpl(ctx) :
                dateBasicsQueryTpl(ctx)},
            ${dateBinsQueryTpl(ctx)},
            ${nullsQueryTpl(ctx)}
            ${dateHistogramQueryTpl(ctx)}
        `;
    }

    _buildQuery (psql, override, callback) {
        var _aggregation = override && override.aggregation ? override.aggregation : this.aggregation;
        var _offset = override && Number.isFinite(override.offset) ? override.offset : this.offset;

        if (!DATE_AGGREGATIONS.hasOwnProperty(_aggregation)) {
            return callback(new Error('Invalid aggregation value. Valid ones: ' +
                Object.keys(DATE_AGGREGATIONS).join(', ')
            ));
        }

        if (_aggregation === 'auto') {
            this.getAutomaticAggregation(psql, function (err, aggregation) {
                if (err || aggregation === 'none') {
                    this.aggregation = 'day';
                } else {
                    this.aggregation = aggregation;
                }
                override.aggregation = this.aggregation;
                this._buildQuery(psql, override, callback);
            }.bind(this));
            return null;
        }

        const histogramSql = this.buildDateHistogramQueryTpl({
            _override: override,
            _query: this.query,
            _column: this.column,
            _aggregation: _aggregation,
            _start: this.getBinStart(override),
            _end: this.getBinEnd(override),
            _offset: this.parseOffset(_offset, _aggregation)
        });

        debug(histogramSql);

        return callback(null, histogramSql);
    }

    getAutomaticAggregation (psql, callback) {
        var dateIntervalQuery = dateIntervalQueryTpl({
            query: this.query,
            column: this.column
        });

        debug(dateIntervalQuery);

        psql.query(dateIntervalQuery, function (err, result) {
            if (err) {
                return callback(err);
            }

            var aggegations = result.rows[0];
            var aggregation = Object.keys(aggegations)
                .map(function (key) {
                    return {
                        name: key,
                        value: aggegations[key]
                    };
                })
                .reduce(function (closer, current) {
                    if (current.value > MAX_INTERVAL_VALUE) {
                        return closer;
                    }

                    var closerDiff = MAX_INTERVAL_VALUE - closer.value;
                    var currentDiff = MAX_INTERVAL_VALUE - current.value;

                    if (Number.isFinite(current.value) && closerDiff > currentDiff) {
                        return current;
                    }

                    return closer;
                }, { name: 'none', value: -1 });

            callback(null, aggregation.name);
        });
    }

    format (result, override) {
        override = override || {};
        var buckets = [];

        var binsCount = this.getBinsCount(override);
        var width = this.getWidth(override);
        var binsStart = this.getBinStart(override);
        var nulls = 0;
        var infinities = 0;
        var nans = 0;
        var avg;
        var timestampStart;
        var aggregation;
        var offset;

        if (result.rows.length) {
            var firstRow = result.rows[0];
            binsCount = firstRow.bins_number;
            width = firstRow.bin_width || width;
            avg = firstRow.avg_val;
            nulls = firstRow.nulls_count;
            timestampStart = firstRow.timestamp_start;
            infinities = firstRow.infinities_count;
            nans = firstRow.nans_count;
            binsStart = this.populateBinStart(override, firstRow);

            if (Number.isFinite(timestampStart)) {
                aggregation = this.getAggregation(override);
                offset = this.getOffset(override);
            }

            buckets = result.rows.map(row => ({ bin, min, max, avg, freq, timestamp } = row));
        }

        return {
            aggregation: aggregation,
            offset: offset,
            timestamp_start: timestampStart,
            bin_width: width,
            bins_count: binsCount,
            bins_start: binsStart,
            nulls: nulls,
            infinities: infinities,
            nans: nans,
            avg: avg,
            bins: buckets
        };
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

    getAggregation (override) {
        return override && override.aggregation ? override.aggregation : this.aggregation;
    }

    getOffset (override) {
        if (override && override.offset) {
            return override.offset;
        }
        if (this.offset) {
            return this.offset;
        }

        return 0;
    }

    getBinStart (override) {
        if (override.hasOwnProperty('start') && override.hasOwnProperty('end')) {
            return Math.min(override.start, override.end);
        }
        return override.start || 0;
    }

    populateBinStart (override, firstRow) {
        var binStart;

        if (firstRow.hasOwnProperty('timestamp')) {
            binStart = firstRow.timestamp;
        } else if (override.hasOwnProperty('start')) {
            binStart = this.getBinStart(override);
        } else {
            binStart = firstRow.min;
        }

        return binStart;
    }

    getBinEnd (override) {
        if (override.hasOwnProperty('start') && override.hasOwnProperty('end')) {
            return Math.max(override.start, override.end);
        }
        return override.end || 0;
    }

    getBinsCount (override) {
        return override.bins || 0;
    }

    getWidth (override) {
        var width = 0;
        var binsCount = override.bins;

        if (binsCount && Number.isFinite(override.start) && Number.isFinite(override.end)) {
            width = (override.end - override.start) / binsCount;
        }

        return width;
    }

    parseOffset (offset, aggregation) {
        if (!offset) {
            return '0';
        }
        if (aggregation === 'hour' || aggregation === 'minute') {
            return '0';
        }

        var offsetInHours = Math.ceil(offset / 3600);
        return '' + offsetInHours;
    }
};
