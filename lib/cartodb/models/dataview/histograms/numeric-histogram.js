'use strict';

const BaseHistogram = require('./base-histogram');
const debug = require('debug')('windshaft:dataview:numeric-histogram');
const utils = require('../../../utils/query-utils');

/** Query to get min, max, count and (if necessary) bin number of the query */
const irqQueryTpl = ctx => `
 __cdb_basics AS (
    SELECT
        *,
        CASE
            WHEN __cdb_total_rows = 0 OR __cdb_iqr = 0 THEN 1
            ELSE GREATEST(
                LEAST(
                    ${ctx.minBins},
                    __cdb_total_rows::int),
                LEAST(
                    ${ctx.maxBins},
                    ((__cdb_max_val - __cdb_min_val) / (2 * __cdb_iqr * power(__cdb_total_rows, 1/3)))::int)
                )
            END AS __cdb_bins_number
    FROM
    (
        SELECT
            max(${ctx.column}) AS __cdb_max_val,
            min(${ctx.column}) AS __cdb_min_val,
            count(1) AS __cdb_total_rows,
            ${ctx.irq ? ctx.irq : `0`} AS __cdb_iqr
        FROM
        (
            SELECT *
            FROM (${ctx.query}) __cdb_filtered_source_query
            WHERE ${utils.handleFloatColumn(ctx)} IS NOT NULL
        ) __cdb_filtered_source
    ) __cdb_basics_2
)
`;

const BIN_MIN_NUMBER = 6;
const BIN_MAX_NUMBER = 48;

/**
Numeric histogram:
{
    type: 'histogram',
    options: {
        column: 'name', // column data type: numeric
        bins: 10 // OPTIONAL
    }
}
*/
module.exports = class NumericHistogram extends BaseHistogram {
    constructor (query, options, queries) {
        super(query, options, queries);
    }

    _buildQuery (psql, override, callback) {
        const histogramSql = this._buildQueryTpl({
            column: this._columnType === 'date' ? utils.columnCastTpl({ column: this.column }) : this.column,
            isFloatColumn: this._columnType === 'float',
            query: this.query,
            start: this._getBinStart(override),
            end: this._getBinEnd(override),
            bins: this._getBinsCount(override),
            minBins: BIN_MIN_NUMBER,
            maxBins: BIN_MAX_NUMBER
        });

        debug(histogramSql);

        return callback(null, histogramSql);
    }


/**
 * ctx: Object with the following values
 * ctx.column -- Column for the histogram
 * ctx.isFloatColumn - Whether the column is float or not
 * ctx.query -- Subquery to extract data
 * ctx.start -- Start value for the bins. [>= end to force calculation]
 * ctx.end -- End value for the bins.
 * ctx.bins -- Numbers of bins to generate [<0 to force calculation]
 * ctx.minBins - If !full min bins to calculate [Optional]
 * ctx.maxBins - If !full max bins to calculate [Optional]
 */
    _buildQueryTpl (ctx) {
        var extra_tables = ``;
        var extra_queries = ``;
        var extra_groupby = ``;
        var extra_filter = ``;

        if (ctx.start < ctx.end) {
            extra_filter = `
              WHERE __ctx_query.${ctx.column} >= ${ctx.start}
                AND __ctx_query.${ctx.column} <= ${ctx.end}
            `;
        } else {
            ctx.end = `__cdb_basics.__cdb_max_val`;
            ctx.start = `__cdb_basics.__cdb_min_val`;
            extra_groupby = `, __cdb_basics.__cdb_max_val, __cdb_basics.__cdb_min_val`;
            extra_tables = `, __cdb_basics`;
            extra_queries = `WITH ${irqQueryTpl(ctx)}`;
        }

        if (ctx.bins <= 0) {
            ctx.bins = `__cdb_basics.__cdb_bins_number`;
            ctx.irq = `percentile_disc(0.75) within group (order by ${ctx.column})
                         - percentile_disc(0.25) within group (order by ${ctx.column})`;
            extra_groupby += `, __cdb_basics.__cdb_bins_number`;
            extra_tables = `, __cdb_basics`;
            extra_queries = `WITH ${irqQueryTpl(ctx)}`;
        }

        return `
${extra_queries}
SELECT
    (${ctx.end} - ${ctx.start}) / ${ctx.bins}::float AS bin_width,
    ${ctx.bins} as bins_number,
    ${utils.countNULLs(ctx)} AS nulls_count,
    ${utils.countInfinites(ctx)} AS infinities_count,
    ${utils.countNaNs(ctx)} AS nans_count,
    min(${utils.handleFloatColumn(ctx)}) AS min,
    max(${utils.handleFloatColumn(ctx)}) AS max,
    avg(${utils.handleFloatColumn(ctx)}) AS avg,
    sum(CASE WHEN (${utils.handleFloatColumn(ctx)} is not NULL) THEN 1 ELSE 0 END) as freq,
    CASE WHEN ${ctx.start} = ${ctx.end}
        THEN 0
        ELSE GREATEST(1, LEAST(
                    ${ctx.bins},
                    WIDTH_BUCKET(${utils.handleFloatColumn(ctx)}, ${ctx.start}, ${ctx.end}, ${ctx.bins}))) - 1
    END AS bin
FROM
(
    SELECT * FROM (${ctx.query}) __ctx_query${extra_tables} ${extra_filter}
) __cdb_filtered_source_query${extra_tables}
GROUP BY 10${extra_groupby}
ORDER BY 10;`;
    }

    _hasOverridenBins (override) {
        return override && override.hasOwnProperty('bins');
    }

    _getSummary (result, override) {
        const firstRow = result.rows[0] || {};

        var total_nulls = 0;
        var total_infinities = 0;
        var total_nans = 0;
        var total_avg = 0;
        var total_count = 0;

        result.rows.forEach(function(row) {
            total_nulls += row.nulls_count;
            total_infinities += row.infinities_count;
            total_nans += row.nans_count;
            total_avg += row.avg * row.freq;
            total_count += row.freq;
        });
        if (total_count !== 0) {
            total_avg /= total_count;
        }

        return {
            bin_width: firstRow.bin_width,
            bins_count: firstRow.bins_number,
            bins_start: this._populateBinStart(firstRow, override),
            nulls: total_nulls,
            infinities: total_infinities,
            nans: total_nans,
            avg: total_avg
        };
    }

    _getBuckets (result) {
        return result.rows.map(({ bin, min, max, avg, freq }) => ({ bin, min, max, avg, freq }));
    }

    _populateBinStart (firstRow, override = {}) {
        let binStart;

        if (override.hasOwnProperty('start')) {
            binStart = this._getBinStart(override);
        } else {
            binStart = firstRow.min;
        }

        return binStart;
    }

};
