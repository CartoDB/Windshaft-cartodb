var _ = require('underscore');
var BaseWidget = require('./base');
var debug = require('debug')('windshaft:dataview:histogram');

var dot = require('dot');
dot.templateSettings.strip = false;

var columnTypeQueryTpl = dot.template(
    'SELECT pg_typeof({{=it.column}})::oid FROM ({{=it.query}}) _cdb_histogram_column_type limit 1'
);
var columnCastTpl = dot.template("date_part('epoch', {{=it.column}})");

var BIN_MIN_NUMBER = 6;
var BIN_MAX_NUMBER = 48;

var basicsQueryTpl = dot.template([
    'basics AS (',
    '  SELECT',
    '    max({{=it._column}}) AS max_val, min({{=it._column}}) AS min_val,',
    '    avg({{=it._column}}) AS avg_val, count(1) AS total_rows',
    '  FROM ({{=it._query}}) _cdb_basics',
    ')'
].join(' \n'));

var overrideBasicsQueryTpl = dot.template([
    'basics AS (',
    '  SELECT',
    '    max({{=it._end}}) AS max_val, min({{=it._start}}) AS min_val,',
    '    avg({{=it._column}}) AS avg_val, count(1) AS total_rows',
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
    '    count(*) AS nulls_count',
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
    '    avg({{=it._column}})::numeric AS avg,',
    '    count(*) AS freq',
    'FROM ({{=it._query}}) _cdb_histogram, basics, nulls, bins',
    'WHERE {{=it._column}} IS NOT NULL',
    'GROUP BY bin, bins_number, bin_width, nulls_count, avg_val',
    'ORDER BY bin'
].join('\n'));

var dateBasicsQueryTpl = dot.template([
    'basics AS (',
    '    SELECT',
    '        max(date_part(\'epoch\', {{=it._column}})) AS max_val,',
    '        min(date_part(\'epoch\', {{=it._column}})) AS min_val,',
    '        avg(date_part(\'epoch\', {{=it._column}})) AS avg_val,',
    '        min(date_trunc(',
    '           \'{{=it._aggregation}}\', {{=it._column}} AT TIME ZONE \'{{=it._timezone}}\'',
    '        )) AS start_date,',
    '        max({{=it._column}} AT TIME ZONE \'{{=it._timezone}}\') AS end_date,',
    '        count(1) AS total_rows',
    '    FROM ({{=it._query}}) _cdb_basics',
    ')'
].join(' \n'));

var dateOverrideBasicsQueryTpl = dot.template([
    'basics AS (',
    '    SELECT',
    '        max({{=it._end}}) AS max_val,',
    '        min({{=it._start}}) AS min_val,',
    '        avg(date_part(\'epoch\', {{=it._column}})) AS avg_val,',
    '        min(date_trunc(',
    '           \'{{=it._aggregation}}\',',
    '           TO_TIMESTAMP({{=it._start}})::timestamp AT TIME ZONE \'{{=it._timezone}}\'',
    '        )) AS start_date,',
    '        max(TO_TIMESTAMP({{=it._end}})::timestamp AT TIME ZONE \'{{=it._timezone}}\') AS end_date,',
    '        count(1) AS total_rows',
    '    FROM ({{=it._query}}) _cdb_basics',
    ')'
].join(' \n'));

var dateBinsQueryTpl = dot.template([
    'bins AS (',
    '    SELECT',
    '        bins_array,',
    '        ARRAY_LENGTH(bins_array, 1) AS bins_number',
    '    FROM (',
    '       SELECT',
    '           ARRAY(',
    '               {{?it._aggregation==="quarter"}}',
    '               SELECT GENERATE_SERIES(start_date, end_date, \'3 month\'::interval)',
    '               {{??}}',
    '               SELECT GENERATE_SERIES(start_date, end_date, \'1 {{=it._aggregation}}\'::interval)',
    '               {{?}}',
    '           ) AS bins_array',
    '       FROM basics',
    '    ) _cdb_bins_array',
    ')'
].join('\n'));

var dateHistogramQueryTpl = dot.template([
    'SELECT',
    '    (max_val - min_val) / cast(bins_number as float) AS bin_width,',
    '    bins_number,',
    '    nulls_count,',
    '    CASE WHEN min_val = max_val',
    '      THEN 0',
    '      ELSE GREATEST(1, LEAST(',
    '        WIDTH_BUCKET({{=it._column}} AT TIME ZONE \'{{=it._timezone}}\', bins_array),',
    '        bins_number',
    '      )) - 1',
    '    END AS bin,',
    '    min(date_part(',
    '       \'epoch\', ',
    '       date_trunc(\'{{=it._aggregation}}\', {{=it._column}} AT TIME ZONE \'{{=it._timezone}}\'',
    '    ) AT TIME ZONE \'{{=it._timezone}}\'))::numeric AS timestamp,',
    '    min(date_part(\'epoch\', ))::numeric AS min,',
    '    max(date_part(\'epoch\', {{=it._column}}))::numeric AS max,',
    '    avg(date_part(\'epoch\', {{=it._column}}))::numeric AS avg,',
    '    count(*) AS freq',
    'FROM ({{=it._query}}) _cdb_histogram, basics, bins, nulls',
    'WHERE date_part(\'epoch\', {{=it._column}}) IS NOT NULL',
    'GROUP BY bin, bins_number, bin_width, nulls_count, avg_val, start_date',
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
    this.aggregation = options.aggregation;
    this.timezone = options.timezone;

    this._columnType = null;
}

Histogram.prototype = new BaseWidget();
Histogram.prototype.constructor = Histogram;

module.exports = Histogram;

var DATE_OIDS = {
    1082: true,
    1114: true,
    1184: true
};

Histogram.prototype.sql = function(psql, override, callback) {
    // jshint maxcomplexity: 7
    if (!callback) {
        callback = override;
        override = {};
    }

    var self = this;

    var _column = this.column;

    var columnTypeQuery = columnTypeQueryTpl({
        column: _column, query: this.queries.no_filters
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

    if (this._columnType === 'date' && this.aggregation !== undefined) {
        return this._buildDateHistogramQuery(override, callback);
    }

    if (this._columnType === 'date') {
        _column = columnCastTpl({ column: this.column});
    }
    var _query = this.query;

    var basicsQuery, binsQuery;

    if (override && _.has(override, 'start') && _.has(override, 'end') && _.has(override, 'bins')) {
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

    debug(histogramSql);

    return callback(null, histogramSql);
};

Histogram.prototype._buildDateHistogramQuery = function (override, callback) {
    var _column = this.column;
    var _query = this.query;
    var _aggregation = override && override.aggregation ? override.aggregation : this.aggregation;
    var _timezone = override && Number.isFinite(override.timezone) ? override.timezone : this.timezone;

    var dateBasicsQuery;

    if (override && _.has(override, 'start') && _.has(override, 'end')) {
        dateBasicsQuery = dateOverrideBasicsQueryTpl({
            _query: _query,
            _column: _column,
            _aggregation: _aggregation,
            _start: getBinStart(override),
            _end: getBinEnd(override),
            _timezone: getTimezone(_timezone)
        });
    } else {
        dateBasicsQuery = dateBasicsQueryTpl({
            _query: _query,
            _column: _column,
            _aggregation: _aggregation,
            _timezone: getTimezone(_timezone)
        });
    }

    var dateBinsQuery = [
        dateBinsQueryTpl({
            _aggregation: _aggregation
        })
    ].join(',\n');

    var nullsQuery = nullsQueryTpl({
        _query: _query,
        _column: _column
    });

    var dateHistogramQuery = dateHistogramQueryTpl({
        _query: _query,
        _column: _column,
        _aggregation: _aggregation,
        _timezone: getTimezone(_timezone)
    });

    var histogramSql = [
        "WITH",
        [
            dateBasicsQuery,
            dateBinsQuery,
            nullsQuery
        ].join(',\n'),
        dateHistogramQuery
    ].join('\n');

    debug(histogramSql);

    return callback(null, histogramSql);
};

Histogram.prototype.format = function(result, override) {
    override = override || {};
    var buckets = [];

    var binsCount = getBinsCount(override);
    var width = getWidth(override);
    var binsStart = getBinStart(override);
    var nulls = 0;
    var avg;

    if (result.rows.length) {
        var firstRow = result.rows[0];
        binsCount = firstRow.bins_number;
        width = firstRow.bin_width || width;
        avg = firstRow.avg_val;
        nulls = firstRow.nulls_count;
        binsStart = override.hasOwnProperty('start') ?
            getBinStart(override) :
            firstRow.hasOwnProperty('timestamp') ?
            firstRow.timestamp :
            firstRow.min;

        buckets = result.rows.map(function(row) {
            return _.omit(row, 'bins_number', 'bin_width', 'nulls_count', 'avg_val', 'bins_start');
        });
    }

    return {
        bin_width: width,
        bins_count: binsCount,
        bins_start: binsStart,
        nulls: nulls,
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

function getTimezone(timezone) {
    if (!timezone) {
        return '0';
    }
    var timezoneInHours = Math.ceil(timezone / 3600);
    return '' + timezoneInHours;
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
