const BaseHistogram = require('./base-histogram');
const debug = require('debug')('windshaft:dataview:numeric-histogram');

const columnCastTpl = ctx => `date_part('epoch', ${ctx.column})`;

const filterOutSpecialNumericValues = ctx => `
        ${ctx.column} != 'infinity'::float
    AND
        ${ctx.column} != '-infinity'::float
    AND
        ${ctx.column} != 'NaN'::float
`;

const filteredQueryTpl = ctx => `
    __cdb_filtered_source AS (
        SELECT *
        FROM (${ctx.query}) __cdb_filtered_source_query
        WHERE ${ctx.column} IS NOT NULL
        ${ctx.isFloatColumn ? `AND ${filterOutSpecialNumericValues(ctx)}` : ''}
    )
`;

const basicsQueryTpl = ctx => `
    __cdb_basics AS (
        SELECT
            max(${ctx.column}) AS __cdb_max_val, min(${ctx.column}) AS __cdb_min_val,
            avg(${ctx.column}) AS __cdb_avg_val, count(1) AS __cdb_total_rows
        FROM __cdb_filtered_source
    )
`;

const overrideBasicsQueryTpl = ctx => `
    __cdb_basics AS (
        SELECT
            max(${ctx.end}) AS __cdb_max_val, min(${ctx.start}) AS __cdb_min_val,
            avg(${ctx.column}) AS __cdb_avg_val, count(1) AS __cdb_total_rows
        FROM __cdb_filtered_source
    )
`;

const iqrQueryTpl = ctx => `
    __cdb_iqrange AS (
        SELECT max(quartile_max) - min(quartile_max) AS __cdb_iqr
        FROM (
            SELECT quartile, max(_cdb_iqr_column) AS quartile_max from (
                SELECT ${ctx.column} AS _cdb_iqr_column, ntile(4) over (order by ${ctx.column}
            ) AS quartile
            FROM __cdb_filtered_source) _cdb_quartiles
            WHERE quartile = 1 or quartile = 3
            GROUP BY quartile
        ) __cdb_iqr
    )
`;

const binsQueryTpl = ctx => `
    __cdb_bins AS (
        SELECT
            CASE WHEN __cdb_total_rows = 0 OR __cdb_iqr = 0
            THEN 1
            ELSE GREATEST(
                LEAST(${ctx.minBins}, CAST(__cdb_total_rows AS INT)),
                LEAST(
                    CAST(((__cdb_max_val - __cdb_min_val) / (2 * __cdb_iqr * power(__cdb_total_rows, 1/3))) AS INT),
                    ${ctx.maxBins}
                )
            )
            END AS __cdb_bins_number
        FROM __cdb_basics, __cdb_iqrange, __cdb_filtered_source
        LIMIT 1
    )
`;

const overrideBinsQueryTpl = ctx => `
    __cdb_bins AS (
        SELECT ${ctx.override.bins} AS __cdb_bins_number
    )
`;

const nullsQueryTpl = ctx => `
    __cdb_nulls AS (
        SELECT
            count(*) AS __cdb_nulls_count
        FROM (${ctx.query}) __cdb_histogram_nulls
        WHERE ${ctx.column} IS NULL
    )
`;

const infinitiesQueryTpl = ctx => `
    __cdb_infinities AS (
        SELECT
            count(*) AS __cdb_infinities_count
        FROM (${ctx.query}) __cdb_infinities_query
        WHERE
            ${ctx.column} = 'infinity'::float
        OR
            ${ctx.column} = '-infinity'::float
    )
`;

const nansQueryTpl = ctx => `
    __cdb_nans AS (
        SELECT
            count(*) AS __cdb_nans_count
        FROM (${ctx.query}) __cdb_nans_query
        WHERE ${ctx.column} = 'NaN'::float
    )
`;

const specialNumericValuesColumnDefinitionTpl = () => `
    __cdb_infinities_count AS infinities_count,
    __cdb_nans_count AS nans_count
`;

const specialNumericValuesCTETpl = () => `
    __cdb_infinities, __cdb_nans
`;

const specialNumericValuesColumnTpl = () => `
    infinities_count, nans_count
`;

const histogramQueryTpl = ctx => `
    SELECT
        (__cdb_max_val - __cdb_min_val) / cast(__cdb_bins_number as float) AS bin_width,
        __cdb_bins_number AS bins_number,
        __cdb_nulls_count AS nulls_count,
        ${ctx.isFloatColumn ? `${specialNumericValuesColumnDefinitionTpl()},` : ''}
        __cdb_avg_val AS avg_val,
        CASE WHEN __cdb_min_val = __cdb_max_val
            THEN 0
            ELSE GREATEST(
                1,
                LEAST(
                    WIDTH_BUCKET(${ctx.column}, __cdb_min_val, __cdb_max_val, __cdb_bins_number),
                    __cdb_bins_number
                )
            ) - 1
        END AS bin,
        min(${ctx.column})::numeric AS min,
        max(${ctx.column})::numeric AS max,
        avg(${ctx.column})::numeric AS avg,
        count(*) AS freq
    FROM __cdb_filtered_source, __cdb_basics, __cdb_nulls, __cdb_bins
        ${ctx.isFloatColumn ? `, ${specialNumericValuesCTETpl()}` : ''}
    GROUP BY bin, bins_number, bin_width, nulls_count, avg_val
        ${ctx.isFloatColumn ? `, ${specialNumericValuesColumnTpl()}` : ''}
    ORDER BY bin
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
            override: override,
            column: this._columnType === 'date' ? columnCastTpl({ column: this.column }) : this.column,
            isFloatColumn: this._columnType === 'float',
            query: this.query,
            start: this._getBinStart(override),
            end: this._getBinEnd(override),
            minBins: BIN_MIN_NUMBER,
            maxBins: BIN_MAX_NUMBER,
        });

        debug(histogramSql);

        return callback(null, histogramSql);
    }

    _buildQueryTpl (ctx) {
        return `
            WITH
            ${filteredQueryTpl(ctx)},
            ${this._hasOverridenRange(ctx.override) ? overrideBasicsQueryTpl(ctx) : basicsQueryTpl(ctx)},
            ${this._hasOverridenBins(ctx.override) ?
                overrideBinsQueryTpl(ctx) :
                `${iqrQueryTpl(ctx)}, ${binsQueryTpl(ctx)}`
            },
            ${nullsQueryTpl(ctx)}
            ${ctx.isFloatColumn ? `,${infinitiesQueryTpl(ctx)}, ${nansQueryTpl(ctx)}` : ''}
            ${histogramQueryTpl(ctx)}
        `;
    }

    _hasOverridenBins (override) {
        return override && override.hasOwnProperty('bins');
    }

    _getSummary (result, override) {
        const firstRow = result.rows[0] || {};

        return {
            bin_width: firstRow.bin_width,
            bins_count: firstRow.bins_number,
            bins_start: this._populateBinStart(firstRow, override),
            nulls: firstRow.nulls_count,
            infinities: firstRow.infinities_count,
            nans: firstRow.nans_count,
            avg: firstRow.avg_val,
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
