var _ = require('underscore');
var BaseOverviewsDataview = require('./base');
var BaseDataview = require('../histogram');

var dot = require('dot');
dot.templateSettings.strip = false;

var columnTypeQueryTpl = dot.template(
    'SELECT pg_typeof({{=it.column}})::oid FROM ({{=it.query}}) _cdb_histogram_column_type limit 1'
);

var BIN_MIN_NUMBER = 6;
var BIN_MAX_NUMBER = 48;

var basicsQueryTpl = dot.template([
    'basics AS (',
    '  SELECT',
    '    max({{=it._column}}) AS max_val, min({{=it._column}}) AS min_val,',
    '    sum({{=it._column}}*_feature_count)/sum(_feature_count) AS avg_val, sum(_feature_count) AS total_rows',
    '  FROM ({{=it._query}}) _cdb_basics',
    ')'
].join(' \n'));

var overrideBasicsQueryTpl = dot.template([
    'basics AS (',
    '  SELECT',
    '    max({{=it._end}}) AS max_val, min({{=it._start}}) AS min_val,',
    '    sum({{=it._column}}*_feature_count)/sum(_feature_count) AS avg_val, sum(_feature_count) AS total_rows',
    '  FROM ({{=it._query}}) _cdb_basics',
    ')'
].join('\n'));

var iqrQueryTpl = dot.template([
    'iqrange AS (',
    '  SELECT max(quartile_max) - min(quartile_max) AS iqr',
    '  FROM (',
    '    SELECT quartile, max(_cdb_iqr_column) AS quartile_max from (',
    '      SELECT {{=it._column}} AS _cdb_iqr_column, ntile(4) over (order by {{=it._column}}',
    '    ) AS quartile',
    '    FROM ({{=it._query}}) _cdb_rank) _cdb_quartiles',
    '    WHERE quartile = 1 or quartile = 3',
    '    GROUP BY quartile',
    '  ) _cdb_iqr',
    ')'
].join('\n'));

var binsQueryTpl = dot.template([
    'bins AS (',
    '  SELECT CASE WHEN total_rows = 0 OR iqr = 0',
    '      THEN 1',
    '      ELSE GREATEST(',
    '        LEAST({{=it._minBins}}, CAST(total_rows AS INT)),',
    '        LEAST(',
    '          CAST(((max_val - min_val) / (2 * iqr * power(total_rows, 1/3))) AS INT),',
    '          {{=it._maxBins}}',
    '        )',
    '      )',
    '    END AS bins_number',
    '  FROM basics, iqrange, ({{=it._query}}) _cdb_bins',
    '  LIMIT 1',
    ')'
].join('\n'));

var overrideBinsQueryTpl = dot.template([
    'bins AS (',
    '  SELECT {{=it._bins}} AS bins_number',
    ')'
].join('\n'));

var nullsQueryTpl = dot.template([
    'nulls AS (',
    '  SELECT',
    '  count(*) AS nulls_count',
    '  FROM ({{=it._query}}) _cdb_histogram_nulls',
    '  WHERE {{=it._column}} IS NULL',
    ')'
].join('\n'));

var histogramQueryTpl = dot.template([
    'SELECT',
    '    (max_val - min_val) / cast(bins_number as float) AS bin_width,',
    '    bins_number,',
    '    nulls_count,',
    '    avg_val,',
    '    CASE WHEN min_val = max_val',
    '      THEN 0',
    '      ELSE GREATEST(1, LEAST(WIDTH_BUCKET({{=it._column}}, min_val, max_val, bins_number), bins_number)) - 1',
    '    END AS bin,',
    '    min({{=it._column}})::numeric AS min,',
    '    max({{=it._column}})::numeric AS max,',
    '    sum({{=it._column}}*_feature_count)/sum(_feature_count)::numeric AS avg,',
    '    sum(_feature_count) AS freq',
    'FROM ({{=it._query}}) _cdb_histogram, basics, nulls, bins',
    'WHERE {{=it._column}} IS NOT NULL',
    'GROUP BY bin, bins_number, bin_width, nulls_count, avg_val',
    'ORDER BY bin'
].join('\n'));

function Histogram(query, options, queryRewriter, queryRewriteData, params, queries) {
    BaseOverviewsDataview.call(this, query, options, BaseDataview, queryRewriter, queryRewriteData, params);

    this.query = query;
    this.queries = queries;
    this.column = options.column;
    this.bins = options.bins;

    this._columnType = null;
}

Histogram.prototype = Object.create(BaseOverviewsDataview.prototype);
Histogram.prototype.constructor = Histogram;

module.exports = Histogram;


var DATE_OIDS = {
    1082: true,
    1114: true,
    1184: true
};

Histogram.prototype.sql = function(psql, override, callback) {
    if (!callback) {
        callback = override;
        override = {};
    }

    var self = this;

    var _column = this.column;

    var columnTypeQuery = columnTypeQueryTpl({
        column: _column, query: this.rewrittenQuery(this.queries.no_filters)
    });

    if (this._columnType === null) {
        psql.query(columnTypeQuery, function(err, result) {
            // assume numeric, will fail later
            self._columnType = 'numeric';
            if (!err && !!result.rows[0]) {
                var pgType = result.rows[0].pg_typeof;
                if (DATE_OIDS.hasOwnProperty(pgType)) {
                    self._columnType = 'date';
                }
            }
            self.sql(psql, override, callback);
        }, true); // use read-only transaction
        return null;
    }

    if (this._columnType === 'date') {
        // overviews currently aggregate dates to NULL
        // to avoid problem we don't use overviews for histograms of date columns
        return this.defaultSql(psql, override, callback);
    }

    var _query = this.rewrittenQuery(this.query);

    var basicsQuery, binsQuery;

    if (override && _.has(override, 'start') && _.has(override, 'end') && _.has(override, 'bins')) {
        basicsQuery = overrideBasicsQueryTpl({
            _query: _query,
            _column: _column,
            _start: override.start,
            _end: override.end
        });

        binsQuery = [
            overrideBinsQueryTpl({
                _bins: override.bins
            })
        ].join(',\n');
    } else {
        basicsQuery = basicsQueryTpl({
            _query: _query,
            _column: _column
        });

        if (override && _.has(override, 'bins')) {
            binsQuery = [
                overrideBinsQueryTpl({
                    _bins: override.bins
                })
            ].join(',\n');
        } else {
            binsQuery = [
                iqrQueryTpl({
                    _query: _query,
                    _column: _column
                }),
                binsQueryTpl({
                    _query: _query,
                    _minBins: BIN_MIN_NUMBER,
                    _maxBins: BIN_MAX_NUMBER
                })
            ].join(',\n');
        }
    }


    var histogramSql = [
        "WITH",
        [
            basicsQuery,
            binsQuery,
            nullsQueryTpl({
                _query: _query,
                _column: _column
            })
        ].join(',\n'),
        histogramQueryTpl({
            _query: _query,
            _column: _column
        })
    ].join('\n');

    return callback(null, histogramSql);
};
