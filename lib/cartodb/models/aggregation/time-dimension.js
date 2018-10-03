const MONTH_SECONDS = 365.2425 / 12 * 24 * 3600; // PG intervals use 30 * 24 * 3600
const YEAR_SECONDS  = 12 * MONTH_SECONDS;

// time unit durations
const usecs = {
    second: 1,
    minute: 60,
    hour: 3600,
    day: 24 * 3600,
    week: 7 * 24 * 3600,
    month: MONTH_SECONDS,
    year:  YEAR_SECONDS,

    quarter: 3 * MONTH_SECONDS,
    semester: 6 * MONTH_SECONDS,
    trimester: 4 * MONTH_SECONDS,
    decade: 12 * YEAR_SECONDS,
    century: 100 * YEAR_SECONDS,
    millennium: 1000 * YEAR_SECONDS
};

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
    year: {
        // TODO: isn't more meaningful to ignore the epoch here and return date_part('year', $t)
        sql: `1 + ${YEARSPAN}`,
        zeroBased: false
    }
};

function serialSqlExpr(t, tz, u, m = 1, starting = undefined) {
    [u, m] = serialNormalize(u, m);
    let { sql, zeroBased } = serialParts[u];
    const column = timeExpression(t, tz);
    const epoch  = epochExpression(starting);
    const serial = sql.replace(/\$t/g, column).replace(/\$epoch/g, epoch);
    let expr = serial;
    if (m !== 1) {
        if (zeroBased) {
            expr = `FLOOR((${expr})/(${m}::double precision))::int`;
        } else {
            expr = `CEIL((${expr})/(${m}::double precision))::int`;
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
    millennium: `to_char(date_part('millenium', $t), '"M"999')`
};

function isoSqlExpr(t, tz, u, m = 1) {
    const column = timeExpression(t, tz);
    if (m > 1) {
        // TODO: it would be sensible to return the ISO of the firt unit in the period
        throw new Error('Multiple time units not supported for ISO format');
    }
    return isoParts[u].replace(/\$t/g, column);
}

function serialNormalize(u, m) {
    if (u === 'semester') {
        u = 'month';
        m *= 6;
    } else if (u === 'trimester') {
        u = 'month';
        m *= 4;
    } else if (u === 'decade') {
        u = 'year';
        m *= 10;
    } else if (u === 'century') {
        u = 'year';
        m *= 100;
    } else if (u === 'millenium') {
        u = 'year';
        m *= 1000;
    }
    return [u, m];
}

function cyclicNormalize(u, m, c) {
    if (u === 'month' && m === 3) {
        u = 'quarter';
        m = 1;
    } else if (u === 'month' && m === 6) {
        u = 'semester';
        m = 1;
    } else if (u === 'month' && m === 4) {
        u = 'trimester';
        m = 1;
    }
    if (m !== 1) {
        throw new Error(`invalid multiplicity ${m} for cyclic ${u}`);
    }
    return [u, m, c];
}

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
    const format = /^(\d\d\d\d)(?:\-?(\d\d)(?:\-?(\d\d)(?:[T\s]?(\d\d)(?:(\d\d)(?:\:(\d\d))?)?)?)?)?$/;
    const match = epoch.match(format) || [];
    const year = match[1] || '0001';
    const month = match[2] || '01';
    const day = match[3] || '01';
    const hour = match[4] || '00';
    const minute = match[5] || '00';
    const second = match[6] || '00';
    epoch = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    return `TIMESTAMP '${epoch}'`;
 }

function cyclicSqlExpr(t, tz, u, c, m = 1) {
    [u, m, c] = cyclicNormalize(u, m, c);
    const comb = `${u}/${c}`;
    const column = timeExpression(t, tz);

    if (m === 1) {
        switch (comb) {
            case 'day/week':
                // 1 = monday; 7 = sunday;
                return `date_part('isodow', ${column})`;

            case 'day/month':
                // result: 1-31
                return `date_part('day', ${column})`;

            case 'day/year':
                // result: 1-366
                return `date_part('doy', ${column})`;

            case 'hour/day':
                // result: 0-23
                return `date_part('hour', ${column})`;

            case 'month/year':
                // result 1-12
                return `date_part('month', ${column})`;

            case 'quarter/year':
                // result 1-4
                return `date_part('quarter', ${column})`;

            case 'semester/year':
                // result 1-2
                return `FLOOR((date_part('month', ${column})-1)/6.0) + 1`;

            case 'trimester/year':
                // result 1-3
                return `FLOOR((date_part('month', ${column})-1)/4.0) + 1`;

            case 'week/year':
                // result 1-53
                return `date_part('week', ${column})`;

            case 'minute/hour':
                // result 0-59
                return `date_part('minute', ${column})`;
        }
    }
    // TODO: remove generic expression, reaching here should error
    return genericCyclicSqlExpr(t, u, c, 0, m);
}

function genericCyclicSqlExpr(t, tz, u, c, c_offset = 0, m = 1) {
    const usec = usecs[u];
    const csec = usecs[c];
    const column = timeExpression(t, tz);
    return `((FLOOR(date_part('epoch', ${column})/(${usec*m}))*(${usec*m})+${c_offset}) % ${csec})/${usec*m}`;
}

function validateParameters(_params) {
    return true;
}

function classificationSql(params) {
    validateParameters(params);
    if (params.group_by_cycle) {
        // TODO: validate group_by_count === 1, No epoch
        return cyclicSqlExpr(
            params.time,
            params.timezone || 'utc',
            params.group_by_units,
            params.group_by_cycle,
            0,
            params.group_by_count || 1
        );
    } else if (params.format === 'iso') {
        // TODO: validate group_by_count === 1, No epoch
        return isoSqlExpr(
            params.time,
            params.timezone || 'utc',
            params.group_by_units,
            params.group_by_count || 1
        );
    } else {
        return serialSqlExpr(
            params.time,
            params.timezone || 'utc',
            params.group_by_units,
            params.group_by_count || 1,
            params.epoch
        );

    }
}
module.exports = classificationSql;
