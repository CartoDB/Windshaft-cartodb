var _ = require('underscore');
var BaseOverviewsDataview = require('./base');
var BaseDataview = require('../histogram');
var debug = require('debug')('windshaft:dataview:histogram:overview');

var dot = require('dot');
dot.templateSettings.strip = false;

var BIN_MIN_NUMBER = 6;
var BIN_MAX_NUMBER = 48;

var filteredQueryTpl = dot.template([
    'filtered_source AS (',
    '  SELECT *',
    '  FROM ({{=it._query}}) _cdb_filtered_source',
    '  WHERE',
    '    {{=it._column}} IS NOT NULL',
    '  {{?it._isFloatColumn}}AND',
    '    {{=it._column}} != \'infinity\'::float',
    '  AND',
    '    {{=it._column}} != \'-infinity\'::float',
    '  AND',
    '    {{=it._column}} != \'NaN\'::float{{?}}',
    ')'
].join(' \n'));

var basicsQueryTpl = dot.template([
    'basics AS (',
    '  SELECT',
    '    max({{=it._column}}) AS max_val, min({{=it._column}}) AS min_val,',
    '    sum({{=it._column}}*_feature_count)/sum(_feature_count) AS avg_val, sum(_feature_count) AS total_rows',
    '  FROM filtered_source',
    ')'
].join(' \n'));

var overrideBasicsQueryTpl = dot.template([
    'basics AS (',
    '  SELECT',
    '    max({{=it._end}}) AS max_val, min({{=it._start}}) AS min_val,',
    '    sum({{=it._column}}*_feature_count)/sum(_feature_count) AS avg_val, sum(_feature_count) AS total_rows',
    '  FROM filtered_source',
    ')'
].join('\n'));

var iqrQueryTpl = dot.template([
    'iqrange AS (',
    '  SELECT max(quartile_max) - min(quartile_max) AS iqr',
    '  FROM (',
    '    SELECT quartile, max(_cdb_iqr_column) AS quartile_max from (',
    '      SELECT {{=it._column}} AS _cdb_iqr_column, ntile(4) over (order by {{=it._column}}',
    '    ) AS quartile',
    '    FROM filtered_source) _cdb_quartiles',
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
    '  FROM basics, iqrange, filtered_source',
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

var infinitiesQueryTpl = dot.template([
    'infinities AS (',
    '  SELECT',
    '    count(*) AS infinities_count',
    '  FROM ({{=it._query}}) _cdb_histogram_infinities',
    '  WHERE',
    '    {{=it._column}} = \'infinity\'::float',
    '  OR',
    '    {{=it._column}} = \'-infinity\'::float',
    ')'
].join('\n'));

var nansQueryTpl = dot.template([
    'nans AS (',
    '  SELECT',
    '    count(*) AS nans_count',
    '  FROM ({{=it._query}}) _cdb_histogram_infinities',
    '  WHERE {{=it._column}} = \'NaN\'::float',
    ')'
].join('\n'));

var histogramQueryTpl = dot.template([
    'SELECT',
    '    (max_val - min_val) / cast(bins_number as float) AS bin_width,',
    '    bins_number,',
    '    nulls_count,',
    '    {{?it._isFloatColumn}}infinities_count,',
    '    nans_count,{{?}}',
    '    avg_val,',
    '    CASE WHEN min_val = max_val',
    '      THEN 0',
    '      ELSE GREATEST(1, LEAST(WIDTH_BUCKET({{=it._column}}, min_val, max_val, bins_number), bins_number)) - 1',
    '    END AS bin,',
    '    min({{=it._column}})::numeric AS min,',
    '    max({{=it._column}})::numeric AS max,',
    '    sum({{=it._column}}*_feature_count)/sum(_feature_count)::numeric AS avg,',
    '    sum(_feature_count) AS freq',
    'FROM filtered_source, basics, nulls, bins{{?it._isFloatColumn}},infinities, nans{{?}}',
    'GROUP BY bin, bins_number, bin_width, nulls_count, avg_val',
    '   {{?it._isFloatColumn}}, infinities_count, nans_count{{?}}',
    'ORDER BY bin'
].join('\n'));

function Histogram(query, options, queryRewriter, queryRewriteData, params, queries) {
    BaseOverviewsDataview.call(this, query, options, BaseDataview, queryRewriter, queryRewriteData, params, queries);

    this.query = query;
    this.queries = queries;
    this.column = options.column;
    this.bins = options.bins;

    this._columnType = null;
}

Histogram.prototype = Object.create(BaseOverviewsDataview.prototype);
Histogram.prototype.constructor = Histogram;

module.exports = Histogram;

Histogram.prototype.sql = function(psql, override, callback) {
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

    if (this._columnType === 'date') {
        // overviews currently aggregate dates to NULL
        // to avoid problem we don't use overviews for histograms of date columns
        return this.defaultSql(psql, override, callback);
    }

    var histogramSql = this._buildQuery(override);

    return callback(null, histogramSql);
};

Histogram.prototype._buildQuery = function (override) {
    var filteredQuery, basicsQuery, binsQuery;
    var _column = this.column;
    var _query = this.rewrittenQuery(this.query);

    filteredQuery = filteredQueryTpl({
        _isFloatColumn: this._columnType === 'float',
        _query: _query,
        _column: _column
    });

    if (this._shouldOverride(override)) {
        debug('overriding with %j', override);
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

        if (this._shouldOverrideBins(override)) {
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

    var cteSql = [
        filteredQuery,
        basicsQuery,
        binsQuery,
        nullsQueryTpl({
            _query: _query,
            _column: _column
        })
    ];

    if (this._columnType === 'float') {
        cteSql.push(
            infinitiesQueryTpl({
                _query: _query,
                _column: _column
            }),
            nansQueryTpl({
                _query: _query,
                _column: _column
            })
        );
    }

    var histogramSql = [
        "WITH",
        cteSql.join(',\n'),
        histogramQueryTpl({
            _isFloatColumn: this._columnType === 'float',
            _query: _query,
            _column: _column
        })
    ].join('\n');

    debug(histogramSql);

    return histogramSql;
};

Histogram.prototype._shouldOverride = function (override) {
    return override && _.has(override, 'start') && _.has(override, 'end') && _.has(override, 'bins');
};

Histogram.prototype._shouldOverrideBins = function (override) {
    return override && _.has(override, 'bins');
};


