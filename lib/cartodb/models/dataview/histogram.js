var _ = require('underscore');
var BaseWidget = require('./base');
var debug = require('debug')('windshaft:dataview:histogram');

var dot = require('dot');
dot.templateSettings.strip = false;

var columnCastTpl = dot.template("date_part('epoch', {{=it.column}})");

var dateIntervalQueryTpl = dot.template([
    'WITH',
    'dates AS (',
    '    SELECT',
    '        MAX({{=it.column}}::timestamp) AS _end,',
    '        MIN({{=it.column}}::timestamp) AS _start',
    '    FROM ({{=it.query}}) _cdb_source',
    '),',
    'interval_in_days AS (',
    '    SELECT' ,
    '        DATE_PART(\'day\', _end - _start) AS days',
    '    FROM dates',
    '),',
    'interval_in_hours AS (',
    '    SELECT',
    '        days * 24 + DATE_PART(\'hour\', _end - _start) AS hours',
    '    FROM interval_in_days, dates',
    '),',
    'interval_in_minutes AS (',
    '    SELECT',
    '        hours * 60 + DATE_PART(\'minute\', _end - _start) AS minutes',
    '    FROM interval_in_hours, dates',
    '),',
    'interval_in_seconds AS (',
    '    SELECT',
    '        minutes * 60 + DATE_PART(\'second\', _end - _start) AS seconds',
    '    FROM interval_in_minutes, dates',
    ')',
    'SELECT',
    '    ROUND(days / 365) AS year,',
    '    ROUND(days / 90) AS quarter,',
    '    ROUND(days / 30) AS month,',
    '    ROUND(days / 7) AS week,',
    '    days AS day,',
    '    hours AS hour,',
    '    minutes AS minute,',
    '    seconds AS second',
    'FROM interval_in_days, interval_in_hours, interval_in_minutes, interval_in_seconds'
].join('\n'));

var MAX_INTERVAL_VALUE = 366;
var BIN_MIN_NUMBER = 6;
var BIN_MAX_NUMBER = 48;

var filteredQueryTpl = dot.template([
    '__cdb_filtered_source AS (',
    '  SELECT *',
    '  FROM ({{=it._query}}) _cdb_filtered_source_query',
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
    '__cdb_basics AS (',
    '  SELECT',
    '    max({{=it._column}}) AS max_val, min({{=it._column}}) AS min_val,',
    '    avg({{=it._column}}) AS avg_val, count(1) AS total_rows',
    '  FROM __cdb_filtered_source',
    ')'
].join(' \n'));

var overrideBasicsQueryTpl = dot.template([
    '__cdb_basics AS (',
    '  SELECT',
    '    max({{=it._end}}) AS max_val, min({{=it._start}}) AS min_val,',
    '    avg({{=it._column}}) AS avg_val, count(1) AS total_rows',
    '  FROM __cdb_filtered_source',
    ')'
].join('\n'));

var iqrQueryTpl = dot.template([
    'iqrange AS (',
    '  SELECT max(quartile_max) - min(quartile_max) AS iqr',
    '  FROM (',
    '    SELECT quartile, max(_cdb_iqr_column) AS quartile_max from (',
    '      SELECT {{=it._column}} AS _cdb_iqr_column, ntile(4) over (order by {{=it._column}}',
    '    ) AS quartile',
    '    FROM __cdb_filtered_source) _cdb_quartiles',
    '    WHERE quartile = 1 or quartile = 3',
    '    GROUP BY quartile',
    '  ) _cdb_iqr',
    ')'
].join('\n'));

var binsQueryTpl = dot.template([
    '__cdb_bins AS (',
    '  SELECT CASE WHEN total_rows = 0 OR iqr = 0',
    '      THEN 1',
    '      ELSE GREATEST(',
    '        LEAST({{=it._minBins}}, CAST(total_rows AS INT)),',
    '        LEAST(',
    '          CAST(((max_val - min_val) / (2 * iqr * power(total_rows, 1/3))) AS INT),',
    '          {{=it._maxBins}}',
    '        )',
    '      )',
    '    END AS __cdb_bins_number',
    '  FROM __cdb_basics, iqrange, __cdb_filtered_source',
    '  LIMIT 1',
    ')'
].join('\n'));

var overrideBinsQueryTpl = dot.template([
    '__cdb_bins AS (',
    '  SELECT {{=it._bins}} AS __cdb_bins_number',
    ')'
].join('\n'));

var nullsQueryTpl = dot.template([
    '__cdb_nulls AS (',
    '  SELECT',
    '    count(*) AS __cdb_nulls_count',
    '  FROM ({{=it._query}}) _cdb_histogram_nulls',
    '  WHERE {{=it._column}} IS NULL',
    ')'
].join('\n'));

var infinitiesQueryTpl = dot.template([
    '__cdb_infinities AS (',
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
    '    (max_val - min_val) / cast(__cdb_bins_number as float) AS bin_width,',
    '    __cdb_bins_number AS bins_number,',
    '    __cdb_nulls_count AS nulls_count,',
    '    {{?it._isFloatColumn}}infinities_count,',
    '    nans_count,{{?}}',
    '    avg_val,',
    '    CASE WHEN min_val = max_val',
    '      THEN 0',
    '      ELSE GREATEST(',
    '           1,',
    '           LEAST(',
    '               WIDTH_BUCKET({{=it._column}}, min_val, max_val, __cdb_bins_number),',
    '               __cdb_bins_number',
    '           )',
    '      ) - 1',
    '    END AS bin,',
    '    min({{=it._column}})::numeric AS min,',
    '    max({{=it._column}})::numeric AS max,',
    '    avg({{=it._column}})::numeric AS avg,',
    '    count(*) AS freq',
    'FROM __cdb_filtered_source, __cdb_basics, __cdb_nulls, __cdb_bins{{?it._isFloatColumn}}, __cdb_infinities, nans{{?}}',
    'GROUP BY bin, bins_number, bin_width, nulls_count,',
    '  avg_val{{?it._isFloatColumn}}, infinities_count, nans_count{{?}}',
    'ORDER BY bin'
].join('\n'));

var dateBasicsQueryTpl = dot.template([
    '__cdb_basics AS (',
    '    SELECT',
    '        max(date_part(\'epoch\', {{=it._column}})) AS __cdb_max_val,',
    '        min(date_part(\'epoch\', {{=it._column}})) AS __cdb_min_val,',
    '        avg(date_part(\'epoch\', {{=it._column}})) AS __cdb_avg_val,',
    '        min(date_trunc(',
    '           \'{{=it._aggregation}}\', {{=it._column}}::timestamp AT TIME ZONE \'{{=it._offset}}\'',
    '        )) AS __cdb_start_date,',
    '        max({{=it._column}}::timestamp AT TIME ZONE \'{{=it._offset}}\') AS __cdb_end_date,',
    '        count(1) AS __cdb_total_rows',
    '    FROM ({{=it._query}}) __cdb_basics_query',
    ')'
].join(' \n'));

var dateOverrideBasicsQueryTpl = dot.template([
    '__cdb_basics AS (',
    '    SELECT',
    '        max({{=it._end}}) AS __cdb_max_val,',
    '        min({{=it._start}}) AS __cdb_min_val,',
    '        avg(date_part(\'epoch\', {{=it._column}})) AS __cdb_avg_val,',
    '        min(',
    '           date_trunc(',
    '               \'{{=it._aggregation}}\',',
    '               TO_TIMESTAMP({{=it._start}})::timestamp AT TIME ZONE \'{{=it._offset}}\'',
    '           )',
    '        ) AS __cdb_start_date,',
    '        max(',
    '           TO_TIMESTAMP({{=it._end}})::timestamp AT TIME ZONE \'{{=it._offset}}\'',
    '        ) AS __cdb_end_date,',
    '        count(1) AS __cdb_total_rows',
    '    FROM ({{=it._query}}) __cdb_basics_query',
    ')'
].join(' \n'));

var dateBinsQueryTpl = dot.template([
    '__cdb_bins AS (',
    '    SELECT',
    '        __cdb_bins_array,',
    '        ARRAY_LENGTH(__cdb_bins_array, 1) AS __cdb_bins_number',
    '    FROM (',
    '       SELECT',
    '           ARRAY(',
    '               SELECT GENERATE_SERIES(',
    '                   __cdb_start_date::timestamptz,',
    '                   __cdb_end_date::timestamptz,',
    '                   {{?it._aggregation==="quarter"}}\'3 month\'{{??}}\'1 {{=it._aggregation}}\'{{?}}::interval',
    '                )',
    '           ) AS __cdb_bins_array',
    '       FROM __cdb_basics',
    '    ) _cdb_bins_array_query',
    ')'
].join('\n'));

var dateHistogramQueryTpl = dot.template([
    'SELECT',
    '    (__cdb_max_val - __cdb_min_val) / cast(__cdb_bins_number as float) AS bin_width,',
    '    __cdb_bins_number AS bins_number,',
    '    __cdb_nulls_count AS nulls_count,',
    '    CASE WHEN __cdb_min_val = __cdb_max_val',
    '      THEN 0',
    '      ELSE GREATEST(1, LEAST(',
    '        WIDTH_BUCKET(',
    '          {{=it._column}}::timestamp AT TIME ZONE \'{{=it._offset}}\',',
    '          __cdb_bins_array',
    '        ),',
    '        __cdb_bins_number',
    '      )) - 1',
    '    END AS bin,',
    '    min(',
    '       date_part(',
    '           \'epoch\', ',
    '           date_trunc(',
    '               \'{{=it._aggregation}}\', {{=it._column}}::timestamp AT TIME ZONE \'{{=it._offset}}\'',
    '           ) AT TIME ZONE \'{{=it._offset}}\'',
    '       )',
    '    )::numeric AS timestamp,',
    '    date_part(\'epoch\', __cdb_start_date)::numeric AS timestamp_start,',
    '    min(date_part(\'epoch\', {{=it._column}}))::numeric AS min,',
    '    max(date_part(\'epoch\', {{=it._column}}))::numeric AS max,',
    '    avg(date_part(\'epoch\', {{=it._column}}))::numeric AS avg,',
    '    count(*) AS freq',
    'FROM ({{=it._query}}) __cdb_histogram, __cdb_basics, __cdb_bins, __cdb_nulls',
    'WHERE date_part(\'epoch\', {{=it._column}}) IS NOT NULL',
    'GROUP BY bin, bins_number, bin_width, nulls_count, timestamp_start',
    'ORDER BY bin'
].join('\n'));

var TYPE = 'histogram';

/**
Numeric histogram:
{
    type: 'histogram',
    options: {
        column: 'name', // column data type: numeric
        bins: 10 // OPTIONAL
    }
}

Time series:
{
    type: 'histogram',
    options: {
        column: 'date', // column data type: date
        aggregation: 'day' // OPTIONAL (if undefined then it'll be built as numeric)
        offset: -7200 // OPTIONAL (UTC offset in seconds)
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
    this.offset = options.offset;

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

    this._buildQuery(psql, override, callback);
};

Histogram.prototype.isDateHistogram = function (override) {
    return this._columnType === 'date' && (this.aggregation !== undefined || override.aggregation !== undefined);
};

Histogram.prototype._buildQuery = function (psql, override, callback) {
    var filteredQuery, basicsQuery, binsQuery;
    var _column = this.column;
    var _query = this.query;

    if (this.isDateHistogram(override)) {
        return this._buildDateHistogramQuery(psql, override, callback);
    }

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

    return callback(null, histogramSql);
};

Histogram.prototype._shouldOverride = function (override) {
    return override && _.has(override, 'start') && _.has(override, 'end') && _.has(override, 'bins');
};

Histogram.prototype._shouldOverrideBins = function (override) {
    return override && _.has(override, 'bins');
};

var DATE_AGGREGATIONS = {
    'auto': true,
    'minute': true,
    'hour': true,
    'day': true,
    'week': true,
    'month': true,
    'quarter': true,
    'year': true
};

Histogram.prototype._buildDateHistogramQuery = function (psql, override, callback) {
    var _column = this.column;
    var _query = this.query;
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
            this._buildDateHistogramQuery(psql, override, callback);
        }.bind(this));
        return null;
    }

    var dateBasicsQuery;

    if (override && _.has(override, 'start') && _.has(override, 'end')) {
        dateBasicsQuery = dateOverrideBasicsQueryTpl({
            _query: _query,
            _column: _column,
            _aggregation: _aggregation,
            _start: getBinStart(override),
            _end: getBinEnd(override),
            _offset: parseOffset(_offset, _aggregation)
        });
    } else {
        dateBasicsQuery = dateBasicsQueryTpl({
            _query: _query,
            _column: _column,
            _aggregation: _aggregation,
            _offset: parseOffset(_offset, _aggregation)
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
        _offset: parseOffset(_offset, _aggregation)
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

Histogram.prototype.getAutomaticAggregation = function (psql, callback) {
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
        binsStart = populateBinStart(override, firstRow);

        if (Number.isFinite(timestampStart)) {
            aggregation = getAggregation(override, this.aggregation);
            offset = getOffset(override, this.offset);
        }

        buckets = result.rows.map(function(row) {
            return _.omit(
                row,
                'bins_number',
                'bin_width',
                'nulls_count',
                'infinities_count',
                'nans_count',
                'avg_val',
                'timestamp_start'
            );
        });
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
};

function getAggregation(override, aggregation) {
    return override && override.aggregation ? override.aggregation : aggregation;
}

function getOffset(override, offset) {
    if (override && override.offset) {
        return override.offset;
    }
    if (offset) {
        return offset;
    }

    return 0;
}

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

function parseOffset(offset, aggregation) {
    if (!offset) {
        return '0';
    }
    if (aggregation === 'hour' || aggregation === 'minute') {
        return '0';
    }

    var offsetInHours = Math.ceil(offset / 3600);
    return '' + offsetInHours;
}

function populateBinStart(override, firstRow) {
    var binStart;

    if (firstRow.hasOwnProperty('timestamp')) {
        binStart = firstRow.timestamp;
    } else if (override.hasOwnProperty('start')) {
        binStart = getBinStart(override);
    } else {
        binStart = firstRow.min;
    }

    return binStart;
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
