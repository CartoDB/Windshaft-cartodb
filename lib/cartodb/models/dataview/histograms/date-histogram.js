const BaseHistogram = require('./base-histogram');
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
            aggregation: 'day' // MANDATORY
            offset: -7200 // OPTIONAL (UTC offset in seconds)
        }
    }
*/
module.exports = class DateHistogram extends BaseHistogram {
    constructor (query, options, queries) {
        super(query, options, queries);

        this.aggregation = options.aggregation;
        this.offset = options.offset;
    }

    _buildQueryTpl (ctx) {
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
        if (!this._isValidAggregation(override)) {
            return callback(new Error('Invalid aggregation value. Valid ones: ' +
                Object.keys(DATE_AGGREGATIONS).join(', ')
            ));
        }

        if (this._getAggregation(override) === 'auto') {
            this._getAutomaticAggregation(psql, function (err, aggregation) {
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

        const histogramSql = this._buildQueryTpl({
            _override: override,
            _query: this.query,
            _column: this.column,
            _aggregation: this._getAggregation(override),
            _start: this._getBinStart(override),
            _end: this._getBinEnd(override),
            _offset: this._parseOffset(override)
        });

        debug(histogramSql);

        return callback(null, histogramSql);
    }

    _isValidAggregation (override) {
        return DATE_AGGREGATIONS.hasOwnProperty(this._getAggregation(override));
    }

    _getAutomaticAggregation (psql, callback) {
        const dateIntervalQuery = dateIntervalQueryTpl({
            query: this.query,
            column: this.column
        });

        psql.query(dateIntervalQuery, function (err, result) {
            if (err) {
                return callback(err);
            }

            const aggegations = result.rows[0];
            const aggregation = Object.keys(aggegations)
                .map(key => ({ name: key, value: aggegations[key] }))
                .reduce((closer, current) => {
                    if (current.value > MAX_INTERVAL_VALUE) {
                        return closer;
                    }

                    const closerDiff = MAX_INTERVAL_VALUE - closer.value;
                    const currentDiff = MAX_INTERVAL_VALUE - current.value;

                    if (Number.isFinite(current.value) && closerDiff > currentDiff) {
                        return current;
                    }

                    return closer;
                }, { name: 'none', value: -1 });

            callback(null, aggregation.name);
        });
    }

    _getSummary (result, override) {
        const firstRow = result.rows[0] || {};

        return {
            aggregation: this._getAggregation(override),
            offset: this._getOffset(override),
            timestamp_start: firstRow.timestamp_start,

            bin_width: firstRow.bin_width,
            bins_count: firstRow.bins_number,
            bins_start: firstRow.timestamp,
            nulls: firstRow.nulls_count,
            infinities: firstRow.infinities_count,
            nans: firstRow.nans_count,
            avg: firstRow.avg_val
        };
    }

    _getBuckets (result) {
        return result.rows.map(({ bin, min, max, avg, freq, timestamp }) => ({ bin, min, max, avg, freq, timestamp }));
    }

    _getAggregation (override = {}) {
        return override.aggregation ? override.aggregation : this.aggregation;
    }

    _getOffset (override = {}) {
        return Number.isFinite(override.offset) ? override.offset : (this.offset || 0);
    }

    _parseOffset (override) {
        if (this._shouldIgnoreOffset(override)) {
            return '0';
        }

        const offsetInHours = Math.ceil(this._getOffset(override) / 3600);

        return '' + offsetInHours;
    }

    _shouldIgnoreOffset (override) {
        return (this._getAggregation(override) === 'hour' || this._getAggregation(override) === 'minute');
    }
};
