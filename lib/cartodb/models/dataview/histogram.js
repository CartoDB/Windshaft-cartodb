var _ = require('underscore');
var BaseWidget = require('./base');
var debug = require('debug')('windshaft:dataview:histogram');

var dot = require('dot');
dot.templateSettings.strip = false;

var columnCastTpl = dot.template("date_part('epoch', {{=it.column}})");

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
    '    avg({{=it._column}}) AS avg_val, count(1) AS total_rows',
    '  FROM filtered_source',
    ')'
].join(' \n'));

var overrideBasicsQueryTpl = dot.template([
    'basics AS (',
    '  SELECT',
    '    max({{=it._end}}) AS max_val, min({{=it._start}}) AS min_val,',
    '    avg({{=it._column}}) AS avg_val, count(1) AS total_rows',
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
    '    avg({{=it._column}})::numeric AS avg,',
    '    count(*) AS freq',
    'FROM filtered_source, basics, nulls, bins{{?it._isFloatColumn}}, infinities, nans{{?}}',
    'GROUP BY bin, bins_number, bin_width, nulls_count,',
    '  avg_val{{?it._isFloatColumn}}, infinities_count, nans_count{{?}}',
    'ORDER BY bin'
].join('\n'));


var TYPE = 'histogram';

/**
 {
     type: 'histogram',
     options: {
         column: 'name',
         bins: 10 // OPTIONAL
     }
 }
 */
function Histogram(query, options, queries) {
    if (!_.isString(options.column)) {
        throw new Error('Histogram expects `column` in widget options');
    }

    this.query = query;
    this.queries = queries;
    this.column = options.column;
    this.bins = options.bins;

    this._columnType = null;
}

Histogram.prototype = new BaseWidget();
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

    var histogramSql = this._buildQuery(override);

    return callback(null, histogramSql);
};

Histogram.prototype._buildQuery = function (override) {
    var filteredQuery, basicsQuery, binsQuery;
    var _column = this.column;
    var _query = this.query;

    if (this._columnType === 'date') {
        _column = columnCastTpl({column: _column});
    }

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
            _start: getBinStart(override),
            _end: getBinEnd(override)
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

Histogram.prototype.format = function(result, override) {
    override = override || {};
    var buckets = [];

    var binsCount = getBinsCount(override);
    var width = getWidth(override);
    var binsStart = getBinStart(override);
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
        binsStart = override.hasOwnProperty('start') ? getBinStart(override) : firstRow.min;

        buckets = result.rows.map(function(row) {
            return _.omit(row, 'bins_number', 'bin_width', 'nulls_count', 'infinities_count', 'nans_count', 'avg_val');
        });
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
};

function getBinStart(override) {
    if (override.hasOwnProperty('start') && override.hasOwnProperty('end')) {
        return Math.min(override.start, override.end);
    }
    return override.start || 0;
}

function getBinEnd(override) {
    if (override.hasOwnProperty('start') && override.hasOwnProperty('end')) {
        return Math.max(override.start, override.end);
    }
    return override.end || 0;
}

function getBinsCount(override) {
    return override.bins || 0;
}

function getWidth(override) {
    var width = 0;
    var binsCount = override.bins;

    if (binsCount && Number.isFinite(override.start) && Number.isFinite(override.end)) {
        width = (override.end - override.start) / binsCount;
    }

    return width;
}

Histogram.prototype.getType = function() {
    return TYPE;
};

Histogram.prototype.toString = function() {
    return JSON.stringify({
        _type: TYPE,
        _column: this.column,
        _query: this.query
    });
};
