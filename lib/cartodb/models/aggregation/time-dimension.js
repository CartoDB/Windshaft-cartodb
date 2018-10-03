// timezones can be defined either by an numeric offset in seconds or by
// a valid (case-insensitive) tz/PG name;
// they include abbreviations defined by PG (which have precedence and
// are fixed offsets, not handling DST) or general names that can handle DST.
function timezone(tz) {
    if (isFinite(tz)) {
        return `INTERVAL '${tz} seconds'`;
    }
    return `'${tz}'`;
}

// We assume t is a TIMESTAMP WITH TIME ZONE.
// If this was to be used with a t which is a TIMESTAMP or TIME (no time zone)
// it should be converted with `timezone('utc',t)` to a type with time zone.
// Note that by default CARTO uses timestamp with time zone columns for dates
// and VectorMapConfigAdapter converts them to epoch numbers.
// So, for using this with aggregations, relying on dates & times
// converted to UTC UNIX epoch numbers, apply `to_timestamp` to the
// (converted) column.
function timeExpression(t, tz) {
   if (tz !== undefined) {
        return `timezone(${timezone(tz)}, ${t})`;
   }
   return t;
}

// Epoch should be an ISO timestamp literal without time zone
// (it is interpreted as in the defined timzezone for the input time)
// It can be partial, e.g. 'YYYY', 'YYYY-MM', 'YYYY-MM-DDTHH', etc.
// Defaults are applied: YYYY=0001, MM=01, DD=01, HH=00, MM=00, S=00
// It returns a timestamp without time zone
function epochExpression(epoch) {
    /* jshint maxcomplexity:8 */ // goddammit linter, I like this as is!!
    const format = /^(\d\d\d\d)(?:\-?(\d\d)(?:\-?(\d\d)(?:[T\s]?(\d\d)(?:(\d\d)(?:\:(\d\d))?)?)?)?)?$/;
    const match  = (epoch || '').match(format) || [];
    const year   = match[1] || '0001';
    const month  = match[2] || '01';
    const day    = match[3] || '01';
    const hour   = match[4] || '00';
    const minute = match[5] || '00';
    const second = match[6] || '00';
    epoch = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    return `TIMESTAMP '${epoch}'`;
 }

const YEARSPAN = "(date_part('year', $t)-date_part('year', $epoch))";
// Note that SECONDSPAN is not a UTC epoch, but an epoch in the specified TZ,
// so we can use it to compute any multiple of seconds with it  without using date_part or date_trunc
const SECONDSPAN = "(date_part('epoch', $t) - date_part('epoch', $epoch))";

const serialParts = {
    second: {
        sql: `FLOOR(${SECONDSPAN})`,
        zeroBased: true
    },
    minute: {
        sql: `FLOOR(${SECONDSPAN}/60)`,
        zeroBased: true
    },
    hour: {
        sql: `FLOOR(${SECONDSPAN}/3600)`,
        zeroBased: true
    },
    day: {
        sql: `1 + FLOOR(${SECONDSPAN}/86400)`,
        zeroBased: false
    },
    week: {
        sql: `1 + FLOOR(${SECONDSPAN}/(7*86400))`,
        zeroBased: false
    },
    month: {
        sql: `1 + date_part('month', $t) - date_part('month', $epoch) + 12*${YEARSPAN}`,
        zeroBased: false
    },
    quarter: {
        sql: `1 + date_part('quarter', $t) - date_part('quarter', $epoch) + 4*${YEARSPAN}`,
        zeroBased: false
    },
    semester: {
        sql: `1 + FLOOR((date_part('month', $t) - date_part('month', $epoch))/6) + 2*${YEARSPAN}`,
        zeroBased: false
    },
    trimester: {
        sql: `1 + FLOOR((date_part('month', $t) - date_part('month', $epoch))/4) + 3*${YEARSPAN}`,
        zeroBased: false
    },
    year: {
        // for the default epoch this coincides with date_part('year', $t)
        sql: `1 + ${YEARSPAN}`,
        zeroBased: false
    },
    decade: {
        // for the default epoch this coincides with date_part('decade', $t)
        sql: `FLOOR((${YEARSPAN} + 1)/10)`,
        zeroBased: true
    },
    century: {
        // for the default epoch this coincides with date_part('century', $t)
        sql: `1 + FLOOR(${YEARSPAN}/100)`,
        zeroBased: false
    },
    millennium: {
        // for the default epoch this coincides with date_part('millennium', $t)
        sql: `1 + FLOOR(${YEARSPAN}/1000)`,
        zeroBased: false
    }
};

function serialSqlExpr(params) {
    const { sql, zeroBased } = serialParts[params.grouping];
    const column = timeExpression(params.time, params.timezone);
    const epoch  = epochExpression(params.starting);
    const serial = sql.replace(/\$t/g, column).replace(/\$epoch/g, epoch);
    let expr = serial;
    if (params.count !== 1) {
        if (zeroBased) {
            expr = `FLOOR((${expr})/(${params.count}::double precision))::int`;
        } else {
            expr = `CEIL((${expr})/(${params.count}::double precision))::int`;
        }
    } else {
        expr = `(${expr})::int`;
    }
    return expr;
}

const isoParts = {
    second: `to_char($t, 'YYYY-MM-DD"T"HH:MI:SS')`,
    minute: `to_char($t, 'YYYY-MM-DD"T"HH:MI')`,
    hour: `to_char($t, 'YYYY-MM-DD"T"HH')`,
    day: `to_char($t, 'YYYY-MM-DD')`,
    month: `to_char($t, 'YYYY-MM')`,
    year: `to_char($t, 'YYYY')`,
    week: `to_char($t, 'IYYY-"W"IW')`,
    quarter: `to_char($t, 'YYYY-"Q"Q')`,
    semester: `to_char($t, 'YYYY"S"') || to_char(CEIL(date_part('month', $t)/6), '9')`,
    trimester: `to_char($t, 'YYYY"t"') || to_char(CEIL(date_part('month', $t)/4), '9')`,
    decade: `to_char(date_part('decade', $t), '"D"999')`,
    century: `to_char($t, '"C"CC')`,
    millennium: `to_char(date_part('millennium', $t), '"M"999')`
};

function isoSqlExpr(params) {
    const column = timeExpression(params.time, params.timezone);
    if (params.count > 1) {
        // TODO: it would be sensible to return the ISO of the first unit in the period
        throw new Error('Multiple time units not supported for ISO format');
    }
    return isoParts[params.grouping].replace(/\$t/g, column);
}

const cyclicParts = {
    dayOfWeek: `date_part('isodow', $t)`,                         // 1 = monday to 7 = sunday;
    dayOfMonth: `date_part('day', $t)`,                           // 1 to 31
    dayOfYear: `date_part('doy', $t)`,                            // 1 to 366
    hourOfDay: `date_part('hour', $t)`,                           // 0 to 23
    monthOfYear: `date_part('month', $t)`,                        // 1 to 12
    quarterOfYear: `date_part('quarter', $t)`,                    // 1 to 4
    semesterOfYear: `FLOOR((date_part('month', $t)-1)/6.0) + 1`,  // 1 to 2
    trimesterOfYear: `FLOOR((date_part('month', $t)-1)/4.0) + 1`, // 1 to 3
    weekOfYear: `date_part('week', $t)`,                          // 1 to 53
    minuteOfHour: `date_part('minute', $t)`                       // 0 to 59
};

function cyclicSqlExpr(params) {
    const column = timeExpression(params.time, params.timezone);
    return cyclicParts[params.grouping].replace(/\$t/g, column);
}

const ACCEPTED_PARAMETERS = ['time', 'grouping', 'timezone', 'count', 'starting', 'format'];
const REQUIRED_PARAMETERS = ['time', 'grouping'];

function validateParameters(params, checker) {
    const errors = [];
    const presentParams = Object.keys(params);
    const invalidParams = presentParams.filter(param => !ACCEPTED_PARAMETERS.includes(param));
    if (invalidParams.length) {
        errors.push(`Invalid parameters: ${invalidParams.join(', ')}`);
    }
    const missingParams = REQUIRED_PARAMETERS.filter(param => !presentParams.includes(param));
    if (missingParams.length) {
        errors.push(`Missing parameters: ${missingParams.join(', ')}`);
    }
    errors.push(...checker(params));
    if (errors.length) {
        throw new Error(`Invalid time dimension:\n${errors.join("\n")}`);
    }
}

const VALID_CYCLIC_GROUPINGS = Object.keys(cyclicParts);
const VALID_SERIAL_GROUPINGS = Object.keys(serialParts);
const VALID_ISO_GROUPINGS = Object.keys(isoParts);

const MONTH_GROUPING = {
  3: 'quarterOfYear',
  6: 'semesterOfYear',
  4: 'trimesterOfYear'
};

function cyclicCheckParams(params) {
    const errors = [];
    if (!VALID_CYCLIC_GROUPINGS.includes(params.grouping)) {
        errors.push(`Invalid grouping "${params.grouping}"`);
    } else {
        if (params.count && params.count > 1) {
            let fixed = false;
            if (params.grouping === 'monthOfYear') {
                 const grouping = MONTH_GROUPING[params.count];
                 if (grouping) {
                     params.grouping = grouping;
                     params.count = 1;
                     fixed = true;
                 }
            }
            if (!fixed) {
                errors.push(`Invalid count ${params.count} for cyclic ${params.grouping}`);
            }
        }
    }
    return errors;
}

function serialCheckParams(params) {
    const errors = [];
    if (!VALID_SERIAL_GROUPINGS.includes(params.grouping)) {
        errors.push(`Invalid grouping "${params.grouping}"`);
    }
    return errors;
}

function isoCheckParams(params) {
    const errors = [];
    if (!VALID_ISO_GROUPINGS.includes(params.grouping)) {
        errors.push(`Invalid grouping "${params.grouping}"`);
    }
    if (params.starting) {
        errors.push("Parameter 'starting' not supported for ISO format");
    }
    return errors;
}

const CLASSIFIERS = {
    cyclic: {
        sqlExpr: cyclicSqlExpr,
        checkParams: cyclicCheckParams
    },
    iso: {
        sqlExpr: isoSqlExpr,
        checkParams: isoCheckParams
    },
    serial: {
        sqlExpr: serialSqlExpr,
        checkParams: serialCheckParams
    }
};

function isCyclic(groupBy) {
    return VALID_CYCLIC_GROUPINGS.includes(groupBy);
}

function classifierFor(params) {
    let classifier = 'serial';
    if (params.grouping && isCyclic(params.grouping)) {
        classifier = 'cyclic';
    } else if (params.format === 'iso') {
        classifier = 'iso';
    }
    return CLASSIFIERS[classifier];
}

function classificationSql(params) {
    const classifier = classifierFor(params);
    validateParameters(params, classifier.checkParams);
    return classifier.sqlExpr(params);
}

module.exports = classificationSql;