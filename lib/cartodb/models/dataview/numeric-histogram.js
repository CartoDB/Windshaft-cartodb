const BaseDataview = require('./base');
const debug = require('debug')('windshaft:dataview:numeric-histogram');

const columnCastTpl = ctx => `date_part('epoch', ${ctx.column})`;

const filterOutSpecialNumericValues = ctx => `
        ${ctx._column} != 'infinity'::float
    AND
        ${ctx._column} != '-infinity'::float
    AND
        ${ctx._column} != 'NaN'::float
`;

const filteredQueryTpl = ctx => `
    __cdb_filtered_source AS (
        SELECT *
        FROM (${ctx._query}) __cdb_filtered_source_query
        WHERE ${ctx._column} IS NOT NULL
        ${ctx._isFloatColumn ? `AND ${filterOutSpecialNumericValues(ctx)}` : ''}
    )
`;

const basicsQueryTpl = ctx => `
    __cdb_basics AS (
        SELECT
            max(${ctx._column}) AS __cdb_max_val, min(${ctx._column}) AS __cdb_min_val,
            avg(${ctx._column}) AS __cdb_avg_val, count(1) AS __cdb_total_rows
        FROM __cdb_filtered_source
    )
`;

const overrideBasicsQueryTpl = ctx => `
    __cdb_basics AS (
        SELECT
            max(${ctx._end}) AS __cdb_max_val, min(${ctx._start}) AS __cdb_min_val,
            avg(${ctx._column}) AS __cdb_avg_val, count(1) AS __cdb_total_rows
        FROM __cdb_filtered_source
    )
`;

const iqrQueryTpl = ctx => `
    __cdb_iqrange AS (
        SELECT max(quartile_max) - min(quartile_max) AS __cdb_iqr
        FROM (
            SELECT quartile, max(_cdb_iqr_column) AS quartile_max from (
                SELECT ${ctx._column} AS _cdb_iqr_column, ntile(4) over (order by ${ctx._column}
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
                LEAST(${ctx._minBins}, CAST(__cdb_total_rows AS INT)),
                LEAST(
                    CAST(((__cdb_max_val - __cdb_min_val) / (2 * __cdb_iqr * power(__cdb_total_rows, 1/3))) AS INT),
                    ${ctx._maxBins}
                )
            )
        END AS __cdb_bins_number
        FROM __cdb_basics, __cdb_iqrange, __cdb_filtered_source
        LIMIT 1
    )
`;

const overrideBinsQueryTpl = ctx => `
    __cdb_bins AS (
        SELECT ${ctx._override.bins} AS __cdb_bins_number
    )
`;

const nullsQueryTpl = ctx => `
    __cdb_nulls AS (
        SELECT
            count(*) AS __cdb_nulls_count
        FROM (${ctx._query}) __cdb_histogram_nulls
        WHERE ${ctx._column} IS NULL
    )
`;

const infinitiesQueryTpl = ctx => `
    __cdb_infinities AS (
        SELECT
            count(*) AS __cdb_infinities_count
        FROM (${ctx._query}) __cdb_infinities_query
        WHERE
            ${ctx._column} = 'infinity'::float
        OR
            ${ctx._column} = '-infinity'::float
    )
`;

const nansQueryTpl = ctx => `
    __cdb_nans AS (
        SELECT
            count(*) AS __cdb_nans_count
        FROM (${ctx._query}) __cdb_nans_query
        WHERE ${ctx._column} = 'NaN'::float
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
        ${ctx._isFloatColumn ? `${specialNumericValuesColumnDefinitionTpl()},` : ''}
        __cdb_avg_val AS avg_val,
        CASE WHEN __cdb_min_val = __cdb_max_val
            THEN 0
            ELSE GREATEST(
                1,
                LEAST(
                    WIDTH_BUCKET(${ctx._column}, __cdb_min_val, __cdb_max_val, __cdb_bins_number),
                    __cdb_bins_number
                )
            ) - 1
        END AS bin,
        min(${ctx._column})::numeric AS min,
        max(${ctx._column})::numeric AS max,
        avg(${ctx._column})::numeric AS avg,
        count(*) AS freq
    FROM __cdb_filtered_source, __cdb_basics, __cdb_nulls, __cdb_bins
        ${ctx._isFloatColumn ? `, ${specialNumericValuesCTETpl()}` : ''}
    GROUP BY bin, bins_number, bin_width, nulls_count, avg_val
        ${ctx._isFloatColumn ? `, ${specialNumericValuesColumnTpl()}` : ''}
    ORDER BY bin
`;

const BIN_MIN_NUMBER = 6;
const BIN_MAX_NUMBER = 48;

const TYPE = 'histogram';

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
module.exports = class NumericHistogram extends BaseDataview {
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

        this._buildQuery(psql, override, callback);
    }


    _buildQuery (psql, override, callback) {
        const histogramSql = this._buildQueryTpl({
            _override: override,
            _column: this._columnType === 'date' ? columnCastTpl({ column: this.column }) : this.column,
            _isFloatColumn: this._columnType === 'float',
            _query: this.query,
            _start: this.getBinStart(override),
            _end: this.getBinEnd(override),
            _minBins: BIN_MIN_NUMBER,
            _maxBins: BIN_MAX_NUMBER,
        });

        debug(histogramSql);

        return callback(null, histogramSql);
    }

    _buildQueryTpl (ctx) {
        return `
            WITH
                ${filteredQueryTpl(ctx)},
                ${this._shouldOverride(ctx._override) ? overrideBasicsQueryTpl(ctx) : basicsQueryTpl(ctx)},
                ${this._shouldOverrideRange(ctx._override) || this._shouldOverrideBins(ctx._override) ?
                    overrideBinsQueryTpl(ctx) :
                    `${iqrQueryTpl(ctx)}, ${binsQueryTpl(ctx)}`
                },
                ${nullsQueryTpl(ctx)}
                ${ctx._isFloatColumn ? `,${infinitiesQueryTpl(ctx)}, ${nansQueryTpl(ctx)}` : ''}
            ${histogramQueryTpl(ctx)}
        `;
    }

    _shouldOverride (override) {
        return this._shouldOverrideRange(override) && this._shouldOverrideBins(override);
    }

    _shouldOverrideRange (override) {
        return override && override.hasOwnProperty('start') && override.hasOwnProperty('end');
    }

    _shouldOverrideBins (override) {
        return override && override.hasOwnProperty('bins');
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

        if (result.rows.length) {
            var firstRow = result.rows[0];
            binsCount = firstRow.bins_number;
            width = firstRow.bin_width || width;
            avg = firstRow.avg_val;
            nulls = firstRow.nulls_count;
            infinities = firstRow.infinities_count;
            nans = firstRow.nans_count;
            binsStart = this.populateBinStart(override, firstRow);

            buckets = result.rows.map(row => ({ bin, min, max, avg, freq } = row));
        }

        return {
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

        if (override.hasOwnProperty('start')) {
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
};
