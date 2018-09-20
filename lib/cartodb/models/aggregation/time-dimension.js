const MONTH_SECONDS = 365.2425 / 12 * 24 * 3600 // PG intervals use 30 * 24 * 3600
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

serialParts = {
    second: {
        sql: `FLOOR(date_part('epoch', $t))`,
        zeroBased: true
    },
    minute: {
        sql: `date_part('epoch', date_trunc('day', $t))/60`,
        zeroBased: true
    },
    hour: {
        sql: `date_part('epoch', date_trunc('day', $t))/(60*60)`,
        zeroBased: true
    },
    day: {
        sql: `date_part('epoch', date_trunc('day', $t))/(24*60*60) + 1`,
        zeroBased: false
    },
    week: {
        sql: `date_part('epoch', date_trunc('week', $t))/(7*24*60*60) + 1`,
        zeroBaseed: false
    },
    month: {
        sql: `date_part('month', $t) + 12*(date_part('year', $t)-date_part('year', to_timestamp(0.0)))`,
        zeroBased: false
    },
    quarter: {
        sql: `date_part('quarter', $t) + 4*(date_part('year', $t)-date_part('year', to_timestamp(0.0)))`,
        zeroBased: false
    },
    year: {
        sql: `date_part('year', $t)-date_part('year', to_timestamp(0.0))`,
        zeroBased: false
    }
};

function serialSqlExpr(t, tz, u, m = 1, u_offset = 0, m_offset = 0) {
    [u, m, u_offset] = serialNormalize(u, m, u_offset);
    let { sql, zeroBased } = serialParts[u];
    const column = timeExpression(t, tz);
    const serial = sql.replace(/\$t/g, column);
    let expr = serial;
    if (u_offset !== 0) {
        expr = `expr - ${u_offset}`;
    }
    if (m !== 1) {
        if (zeroBased) {
            expr = `FLOOR((${expr})/(${m}::double precision))::int`;
        } else {
            expr = `CEIL((${expr})/(${m}::double precision))::int`;
        }
    } else {
        expr = `ROUND(${expr})::int`;
    }
    if (m_offset !== 0) {
        expr = `(${expr} - 1)`;
    }
    return expr;
}

function serialNormalize(u, m, u_offset) {
    if (u === 'semester') {
        u = 'month';
        m *= 6;
        u_offset *= 6;
    } else if (u === 'trimester') {
        u = 'month';
        m *= 4;
        u_offset *= 4;
    } else if (u === 'decade') {
        u = 'year';
        m *= 10;
        u_offset *= 10
    } else if (u === 'century') {
        u = 'year';
        m *= 100;
        u_offset *= 100
    } else if (u === 'millenium') {
        u = 'year';
        m *= 1000;
        u_offset *= 1000
    }
    return [u, m, u_offset];
}

function cyclicNormalize(u, m, c, c_offset) {
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
    return [u, m, c, c_offset];
}

// timezones can be defined either by an numeric offset in seconds or by
// a valid (case-insensitive) tz/PG name;
// they include abbreviations defined by PG (which have precedence and
// are fixed offsets, not handling DST) or general names that can handle DST.
function timezone(tz) {
    if (isFinite(tz)) {
        return `INTERVAL '${tz} seconds'`;
    }
    return `'${tz}'`
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
        return `timezone(${timezone(tz)}, ${t})`
   }
   return t;
}

function cyclicSqlExpr(t, tz, u, c, c_offset = 0, m = 1) {
    [u, m, c, c_offset] = cyclicNormalize(u, m, c, c_offset);
    const comb = `${u}/${c}`;
    const column = timeExpression(t, tz);
    let expr;

    if (m === 1) {
        switch (comb) {
            case 'day/week':
                // result: 0-6
                // c_offset = 0 => 0 = sunday; 1 => 0 = monday...
                // let expr = `EXTRACT(DOW FROM ${column})`;
                expr = `date_part('dow', ${column})`;
                if (c_offset !== 0) {
                    expr = `(${expr} - ${c_offset}) % 7`;
                }
                return expr;

                // iso dow monday=1, no offset:
                //   `EXTRACT(ISODOW FROM ${column})`
                // iso dow 1-6, offset 0 => 1 = mondayº
                //   expr = `date_part('dow, ${column})`;
                //   c_offset += 1;
                //   expr = `(${expr} - ${c_offset}) % 7 + 1`;

            case 'day/month':
                // result: 1-31
                // c_offset not supported
                return `date_part('day', ${column})`;

            case 'day/year':
                // result: 1-366
                // c_offset not supported
                return `date_part('doy', ${column})`;

            case 'hour/day':
                // result: 0-23
                expr = `date_part('hour', ${column})`;
                if (c_offset !== 0) {
                    expr = `(${expr} - ${c_offset}) % 24`;
                }
                return expr;

            case 'month/year':
                // result 1-12
                expr = `date_part('month', ${column})`;
                if (c_offset !== 0) {
                    expr = `((${expr} - ${c_offset} - 1) % 12) + 1`;
                }
                return expr;

            case 'quarter/year':
                // result 1-4
                expr = `date_part('quarter', ${column})`;
                if (c_offset !== 0) {
                    expr = `((${expr} - ${c_offset} - 1) % 4) + 1`;
                }
                return expr;

            case 'semester/year':
                // result 1-2
                expr = `FLOOR((date_part('month', ${column})-1)/6.0) + 1`;
                if (c_offset !== 0) {
                    expr = `((${expr} - ${c_offset} - 1) % 2) + 1`;
                }
                return expr;

            case 'trimester/year':
                // result 1-3
                expr = `FLOOR((date_part('month', ${column})-1)/4.0) + 1`;
                if (c_offset !== 0) {
                    expr = `((${expr} - ${c_offset} - 1) % 3) + 1`;
                }
                return expr;

            case 'week/year':
                // result 1-52
                expr = `date_part('week', ${column})`;
                if (c_offset !== 0) {
                    expr = `((${expr} - ${c_offset} - 1) % 52) + 1`;
                }
                return expr;

            case 'minute/hour':
                // result 0-59
                expr = `date_part('minute', ${column})`;
                if (c_offset !== 0) {
                    expr = `((${expr} - ${c_offset}) % 60)`;
                }
                return expr;
        }
    }
    return genericCyclicSqlExpr(t, u, c, c_offset, m);
}

function genericCyclicSqlExpr(t, tz, u, c, c_offset = 0, m = 1) {
    const usec = usecs[u];
    const csec = usecs[c];
    const column = timeExpression(t, tz);
    return `((FLOOR(date_part('epoch', ${column})/(${usec*m}))*(${usec*m})+${c_offset}) % ${csec})/${usec*m}`;
}

function validateParameters(params) {
    return true;
}

function classificationSql(params) {
    validateParameters(params);
    if (params.cycle) {
        return cyclicSqlExpr(
            params.time,
            params.timezone || 'utc',
            params.granularity,
            params.cycle,
            params.offset || 0,
            params.multiplicity || 1
        );
    } else {
        return serialSqlExpr(
            params.time,
            params.timezone || 'utc',
            params.granularity,
            params.multiplicity || 1,
            params.offset || 0,
            0
        );

    }
}
module.exports = classificationSql;
