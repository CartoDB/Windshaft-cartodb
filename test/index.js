'use strict';

const redis = require('redis');
const pg = require('pg');
const fs = require('fs').promises;

if (!process.env.NODE_ENV) {
    console.error('Please set "NODE_ENV" variable, e.g.: "NODE_ENV=test"');
    process.exit(1);
}
let configFileName = process.env.NODE_ENV;
if (process.env.CARTO_WINDSHAFT_ENV_BASED_CONF) {
    // we override the file with the one with env vars
    configFileName = 'config';
}

const environment = require(`../config/environments/${configFileName}.js`);

const PGHOST = environment.postgres.host;
const PGPORT = environment.postgres.port;
const TEST_USER_ID = 1;
const TEST_USER = environment.postgres_auth_user.replace('<%= user_id %>', TEST_USER_ID);
const TEST_PASSWORD = environment.postgres_auth_pass.replace('<%= user_id %>', TEST_USER_ID);
const PUBLIC_USER = environment.postgres.user;
const PUBLIC_USER_PASSWORD = environment.postgres.password;
const TEST_DB = `${TEST_USER}_db`;

async function query ({ db = 'postgres', sql }) {
    const client = new pg.Client({
        host: PGHOST,
        port: PGPORT,
        user: 'postgres',
        database: db
    });

    await new Promise((resolve, reject) => client.connect((err) => err ? reject(err) : resolve()));
    const res = await new Promise((resolve, reject) => client.query(sql, (err, res) => err ? reject(err) : resolve(res)));
    await new Promise((resolve, reject) => client.end((err) => err ? reject(err) : resolve()));

    return res;
}

async function dropDatabase () {
    await query({ sql: `DROP DATABASE IF EXISTS ${TEST_DB}` });
}

async function createDatabase () {
    await query({ sql: `CREATE DATABASE ${TEST_DB} TEMPLATE template_postgis ENCODING UTF8` });
}

async function createDatabaseExtension () {
    await query({ db: TEST_DB, sql: 'CREATE EXTENSION IF NOT EXISTS cartodb CASCADE' });
}

async function currentSearchPath () {
    const res = await query({ db: TEST_DB, sql: 'SELECT current_setting(\'search_path\')' });
    return res.rows[0].current_setting;
}

async function populateDatabase () {
    const searchPath = await currentSearchPath();

    const filenames = [
        'users',
        'analysis_catalog',
        'windshaft.test',
        'gadm4',
        'countries_null_values',
        'ported/populated_places_simple_reduced',
        'cdb_analysis_check',
        'cdb_invalidate_varnish'
    ].map(filename => `${__dirname}/support/sql/${filename}.sql`);

    for (const filename of filenames) {
        const content = await fs.readFile(filename, 'utf-8');
        const sql = content
            .replace(/:SEARCHPATH/g, searchPath)
            .replace(/:PUBLICUSER/g, PUBLIC_USER)
            .replace(/:PUBLICPASS/g, PUBLIC_USER_PASSWORD)
            .replace(/:TESTUSER/g, TEST_USER)
            .replace(/:TESTPASS/g, TEST_PASSWORD);

        await query({ db: TEST_DB, sql });
    }
}

async function vacuumAnalyze () {
    const tables = [
        'countries_null_values',
        'test_table',
        'test_table_2',
        'test_table_3',
        'test_table_private_1',
        'long_table_name_with_enough_chars_to_break_querytables_function',
        'test_big_poly',
        'test_table_overviews',
        '_vovw_1_test_table_overviews',
        '_vovw_2_test_table_overviews',
        'test_special_float_values_table_overviews',
        '_vovw_1_test_special_float_values_table_overviews',
        'test_table_localhost_regular1',
        'analysis_banks',
        'analysis_rent_listings',
        'test_table_100',
        'test_table_200k',
        'populated_places_simple_reduced',
        'populated_places_simple_reduced_private'
    ];
    await query({ db: TEST_DB, sql: `VACUUM ANALYZE ${tables.join(', ')}` });
}

async function populateRedis () {
    const { host, port } = environment.redis;
    const client = redis.createClient({ host, port, db: 5 });

    const commands = client.multi()
        .hmset('rails:users:localhost', [
            'id', TEST_USER_ID,
            'database_name', TEST_DB,
            'database_host', PGHOST,
            'map_key', '1234'
        ])
        .hmset('rails:users:cartodb250user', [
            'id', TEST_USER_ID,
            'database_name', TEST_DB,
            'database_host', PGHOST,
            'database_password', TEST_PASSWORD,
            'map_key', '4321'
        ])
        .hmset('api_keys:localhost:1234', [
            'user', 'localhost',
            'type', 'master',
            'grants_sql', 'true',
            'grants_maps', 'true',
            'database_role', TEST_USER,
            'database_password', TEST_PASSWORD
        ])
        .hmset('api_keys:localhost:default_public', [
            'user', 'localhost',
            'type', 'default',
            'grants_sql', 'true',
            'grants_maps', 'true',
            'database_role', 'test_windshaft_publicuser',
            'database_password', 'public'
        ])
        .hmset('api_keys:localhost:regular1', [
            'user', 'localhost',
            'type', 'regular',
            'grants_sql', 'true',
            'grants_maps', 'true',
            'database_role', 'test_windshaft_regular1',
            'database_password', 'regular1'
        ])
        .hmset('api_keys:localhost:regular2', [
            'user', 'localhost',
            'type', 'regular',
            'grants_sql', 'true',
            'grants_maps', 'false',
            'database_role', 'test_windshaft_publicuser',
            'database_password', 'public'
        ])
        .hmset('api_keys:cartodb250user:4321', [
            'user', 'localhost',
            'type', 'master',
            'grants_sql', 'true',
            'grants_maps', 'true',
            'database_role', TEST_USER,
            'database_password', TEST_PASSWORD
        ])
        .hmset('api_keys:cartodb250user:default_public', [
            'user', 'localhost',
            'type', 'default',
            'grants_sql', 'true',
            'grants_maps', 'true',
            'database_role', 'test_windshaft_publicuser',
            'database_password', 'public'
        ]);

    await new Promise((resolve, reject) => commands.exec((err) => err ? reject(err) : resolve()));
    await new Promise((resolve, reject) => client.quit((err) => err ? reject(err) : resolve()));
}

async function unpopulateRedis () {
    const { host, port } = environment.redis;
    const client = redis.createClient({ host, port, db: 5 });

    const commands = client.multi()
        .del('rails:users:localhost')
        .del('rails:users:cartodb250user')
        .del('api_keys:localhost:1234')
        .del('api_keys:localhost:default_public')
        .del('api_keys:localhost:regular1')
        .del('api_keys:localhost:regular2')
        .del('api_keys:cartodb250user:4321')
        .del('api_keys:cartodb250user:default_public');

    await new Promise((resolve, reject) => commands.exec((err) => err ? reject(err) : resolve()));
    await new Promise((resolve, reject) => client.quit((err) => err ? reject(err) : resolve()));
}

async function main (args) {
    let code = 0;

    try {
        switch (args[0]) {
        case 'setup':
            await unpopulateRedis();
            await populateRedis();
            await dropDatabase();
            await createDatabase();
            await createDatabaseExtension();
            await populateDatabase();
            await vacuumAnalyze();
            break;
        case 'teardown':
            await unpopulateRedis();
            await dropDatabase();
            break;
        default:
            throw new Error('Missing "mode" argument. Valid ones: "setup" or "teardown"');
        }
    } catch (err) {
        console.error(err);
        code = 1;
    } finally {
        process.exit(code);
    }
}

main(process.argv.slice(2));
