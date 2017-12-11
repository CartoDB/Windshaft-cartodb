const BaseHistogram = require('./base-histogram');
const debug = require('debug')('windshaft:dataview:date-histogram');
const utils = require('../../../utils/query-utils');

/**
 * Gets the name of a timezone with the same offset as the required
 * using the pg_timezone_names table. We do this because it's simpler to pass
 * the name than to pass the offset itself as PostgreSQL uses different
 * sign convention. For example: TIME ZONE 'CET' is equal to TIME ZONE 'UTC-1',
 * not 'UTC+1' which would be expected.
 * Gives priority to Etc/GMT±N timezones but still support odd offsets like 8.5
 * hours for Asia/Pyongyang.
 * It also makes it easier to, in the future, support the input of expected timezone
 * instead of the offset; that is using 'Europe/Madrid' instead of
 * '+3600' or '+7200'. The daylight saving status can be handled by postgres.
 */
const offsetNameQueryTpl = ctx => `
WITH __wd_tz AS
(
    SELECT name
    FROM pg_timezone_names
    WHERE utc_offset = interval '${ctx.offset} hours'
    ORDER BY CASE WHEN name LIKE 'Etc/GMT%' THEN 0 ELSE 1 END
    LIMIT 1
),`;

/**
 * Function to get the subquery that places each row in its bin depending on
 * the aggregation. Since the data stored is in epoch we need to adapt it to
 * our timezone so when calling date_trunc it falls into the correct bin
 */
function dataBucketsQuery(ctx) {
    var condition_str = '';

    if (ctx.start !== 0) {
        condition_str = `WHERE ${ctx.column} >= to_timestamp(${ctx.start})`;
    }
    if (ctx.end !== 0) {
        if (condition_str === '') {
            condition_str = `WHERE ${ctx.column} <= to_timestamp(${ctx.end})`;
        }
        else {
            condition_str += ` and ${ctx.column} <= to_timestamp(${ctx.end})`;
        }
    }

    return `
__wd_buckets AS
(
    SELECT
        date_trunc('${ctx.aggregation}', timezone(__wd_tz.name, ${ctx.column}::timestamptz)) as timestamp,
        count(*) as freq,
        ${utils.countNULLs(ctx)} as nulls_count
    FROM
    (
        ${ctx.query}
    ) __source, __wd_tz
    ${condition_str}
    GROUP BY timestamp, __wd_tz.name
),`;
}

/**
 * Function that generates an array with all the possible bins between the
 * start and end date. If not provided we use the min and max generated from
 * the dataBucketsQuery
 */
function allBucketsArrayQuery(ctx) {
    var extra_from = ``;
    var series_start = ``;
    var series_end = ``;

    if (ctx.start === 0) {
        extra_from = `, __wd_buckets GROUP BY __wd_tz.name`;
        series_start = `min(__wd_buckets.timestamp)`;
    } else {
        series_start = `date_trunc('${ctx.aggregation}', timezone(__wd_tz.name, to_timestamp(${ctx.start})))`;
    }

    if (ctx.end === 0) {
        extra_from = `, __wd_buckets GROUP BY __wd_tz.name`;
        series_end = `max(__wd_buckets.timestamp)`;
    } else {
        series_end = `date_trunc('${ctx.aggregation}', timezone(__wd_tz.name, to_timestamp(${ctx.end})))`;
    }

    return `
__wd_all_buckets AS
(
    SELECT ARRAY(
        SELECT
            generate_series(
                    ${series_start},
                    ${series_end},
                    interval '${ctx.interval}') as bin_start
            FROM __wd_tz${extra_from}
    ) as bins
)`;
}

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
${offsetNameQueryTpl(ctx)}
${dataBucketsQuery(ctx)}
${allBucketsArrayQuery(ctx)}
SELECT
    array_position(__wd_all_buckets.bins, __wd_buckets.timestamp) - 1 as bin,
    date_part('epoch', timezone(__wd_tz.name, __wd_buckets.timestamp)) AS timestamp,
    __wd_buckets.freq as freq,
    date_part('epoch', timezone(__wd_tz.name, (__wd_all_buckets.bins)[1])) as timestamp_start,
    array_length(__wd_all_buckets.bins, 1) as bins_number,
    date_part('epoch', interval '${ctx.interval}') as bin_width,
    __wd_buckets.nulls_count as nulls_count
FROM __wd_buckets, __wd_all_buckets, __wd_tz
GROUP BY __wd_tz.name, __wd_all_buckets.bins, __wd_buckets.timestamp, __wd_buckets.nulls_count, __wd_buckets.freq
ORDER BY bin ASC;
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

        var interval = this._getAggregation(override) === 'quarter' ?
            '3 months' : '1 ' + this._getAggregation(override);

        const histogramSql = this._buildQueryTpl({
            override: override,
            query: this.query,
            column: this.column,
            aggregation: this._getAggregation(override),
            start: this._getBinStart(override),
            end: this._getBinEnd(override),
            offset: this._parseOffset(override),
            interval: interval
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

            bin_width: firstRow.bin_width || 0,
            bins_count: firstRow.bins_number || 0,
            bins_start: firstRow.timestamp,
            nulls: firstRow.nulls_count,
            infinities: firstRow.infinities_count,
            nans: firstRow.nans_count,
            avg: firstRow.avg_val
        };
    }

    _getBuckets (result) {
        result.rows.forEach(function(row) {
            row.min = row.max = row.avg = row.timestamp;
        });

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
