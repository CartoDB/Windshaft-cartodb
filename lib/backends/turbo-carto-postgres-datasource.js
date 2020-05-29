'use strict';

const STRATEGY = {
    SPLIT: 'split',
    EXACT: 'exact'
};

const method2strategy = {
    headtails: STRATEGY.SPLIT,
    category: STRATEGY.EXACT
};

const validMethods = ['quantiles', 'equal', 'jenks', 'headtails', 'category'];

module.exports = class PostgresDatasource {
    constructor (psql, query) {
        this._psql = psql;
        this._query = query;
    }

    getName () {
        return 'PostgresDatasource';
    }

    getRamp (column, buckets, method = 'quantiles', callback) {
        const readOnlyTransaction = true;

        if (!validMethods.includes(method)) {
            return callback(new Error(`Invalid method "${method}", valid methods: [${validMethods.join(',')}]`));
        }

        const query = queryTemplate({ column, buckets, method, query: this._query });

        this._psql.query(query, (err, resultSet) => {
            if (err) {
                return callback(err);
            }

            const result = getResult(resultSet);
            const strategy = method2strategy[method];
            let ramp = result[method] || [];
            const stats = {
                min_val: result.min_val,
                max_val: result.max_val,
                avg_val: result.avg_val
            };

            // Skip null values from ramp
            // Generated turbo-carto won't be correct, but better to keep it working than failing
            // TODO: fix cartodb-postgres extension quantification functions
            ramp = ramp.filter(value => value !== null);

            if (strategy !== STRATEGY.EXACT) {
                ramp = ramp.sort((a, b) => a - b);
            }

            return callback(null, { ramp, strategy, stats });
        }, readOnlyTransaction);
    }
};

function methodQueryTemplate ({ column, buckets, method, query }) {
    return `
        SELECT
            min(${column}) min_val,
            max(${column}) max_val,
            avg(${column}) avg_val,
            ${methods[method]({ column, buckets, query })}
        FROM (${query}) _table_sql
        WHERE
            ${column} IS NOT NULL
        AND
            ${column} != 'infinity'::float
        AND
            ${column} != '-infinity'::float
        AND
            ${column} != 'NaN'::float
    `;
}

const methods = {
    quantiles: ({ column, buckets }) => `CDB_QuantileBins(array_agg(${column}::numeric), ${buckets}) as quantiles`,
    equal: ({ column, buckets }) => `CDB_EqualIntervalBins(array_agg(${column}::numeric), ${buckets}) as equal`,
    jenks: ({ column, buckets }) => `CDB_JenksBins(array_agg(${column}::numeric), ${buckets}) as jenks`,
    headtails: ({ column, buckets }) => `CDB_HeadsTailsBins(array_agg(${column}::numeric), ${buckets}) as headtails`
};

function categoryQueryTemplate ({ column, buckets, query }) {
    return `
        WITH
        categories AS (
            SELECT ${column} AS category, count(1) AS value, row_number() OVER (ORDER BY count(1) desc) as rank
            FROM (${query}) _cdb_aggregation_all
            GROUP BY ${column}
            ORDER BY 2 DESC, 1 ASC
        ),
        agg_categories AS (
            SELECT category
            FROM categories
            WHERE rank <= ${buckets}
        )
        SELECT array_agg(category) AS category FROM agg_categories
    `;
}

function queryTemplate ({ column, buckets, method, query }) {
    return `${method === 'category' ? categoryQueryTemplate({ column, buckets, query }) : methodQueryTemplate({ column, buckets, method, query })}`;
}

function getResult (resultSet = {}) {
    let result = resultSet.rows || [];

    result = result[0] || {};

    return result;
}
