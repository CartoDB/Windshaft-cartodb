'use strict';

const util = require('util');
const path = require('path');
const exec = util.promisify(require('child_process').exec);

if (!process.env.NODE_ENV) {
    console.error('Please set "NODE_ENV" variable, e.g.: "NODE_ENV=test"');
    process.exit(1);
}

const environment = require(`../config/environments/${process.env.NODE_ENV}.js`);
const REDIS_PORT = environment.redis.port;
const REDIS_CELL_PATH = path.resolve(
    process.platform === 'darwin'
        ? './test/support/libredis_cell.dylib'
        : './test/support/libredis_cell.so'
);

const TEST_USER_ID = 1;
const TEST_USER = environment.postgres_auth_user.replace('<%= user_id %>', TEST_USER_ID);
const TEST_PASSWORD = environment.postgres_auth_pass.replace('<%= user_id %>', TEST_USER_ID);
const PUBLIC_USER = environment.postgres.user;
const PUBLIC_USER_PASSWORD = environment.postgres.password;
const TEST_DB = `${TEST_USER}_db`;

async function startRedis () {
    await exec(`redis-server --port ${REDIS_PORT} --loadmodule ${REDIS_CELL_PATH} --logfile ${__dirname}/redis-server.log --daemonize yes`);
}

async function stopRedis () {
    await exec(`redis-cli -p ${REDIS_PORT} shutdown`);
}

async function dropDatabase () {
    await exec(`dropdb --if-exists ${TEST_DB}`, {
        env: Object.assign({ PGUSER: 'postgres' }, process.env)
    });
}

async function createDatabase () {
    await exec(`createdb -T template_postgis -EUTF8 "${TEST_DB}"`, {
        env: Object.assign({ PGUSER: 'postgres' }, process.env)
    });
}

async function createDatabaseExtension () {
    await exec(`psql -c "CREATE EXTENSION IF NOT EXISTS cartodb CASCADE;" ${TEST_DB}`, {
        env: Object.assign({ PGUSER: 'postgres' }, process.env)
    });
}

async function populateDatabase () {
    const filenames = [
        'analysis_catalog',
        'windshaft.test',
        'gadm4',
        'countries_null_values',
        'ported/populated_places_simple_reduced',
        'cdb_analysis_check',
        'cdb_invalidate_varnish'
    ].map(filename => `${__dirname}/support/sql/${filename}.sql`);

    const populateDatabaseCmd = `
        cat ${filenames.join(' ')} |
        sed -e "s/:PUBLICUSER/${PUBLIC_USER}/g" |
        sed -e "s/:PUBLICPASS/${PUBLIC_USER_PASSWORD}/g" |
        sed -e "s/:TESTUSER/${TEST_USER}/g" |
        sed -e "s/:TESTPASS/${TEST_PASSWORD}/g" |
        PGOPTIONS='--client-min-messages=WARNING' psql -q -v ON_ERROR_STOP=1 ${TEST_DB}
    `;

    await exec(populateDatabaseCmd, {
        env: Object.assign({ PGUSER: 'postgres' }, process.env)
    });
}

async function populateRedis () {
    const commands = `
        FLUSHALL

        HMSET rails:users:localhost \
            id ${TEST_USER_ID} \
            database_name "${TEST_DB}" \
            database_host localhost \
            map_key 1234

        HMSET rails:users:cartodb250user \
            id ${TEST_USER_ID} \
            database_name "${TEST_DB}" \
            database_host "localhost" \
            database_password "${TEST_PASSWORD}" \
            map_key 4321

        HMSET api_keys:localhost:1234 \
            user "localhost" \
            type "master" \
            grants_sql "true" \
            grants_maps "true" \
            database_role "${TEST_USER}" \
            database_password "${TEST_PASSWORD}"

        HMSET api_keys:localhost:default_public \
            user "localhost" \
            type "default" \
            grants_sql "true" \
            grants_maps "true" \
            database_role "test_windshaft_publicuser" \
            database_password "public"

        HMSET api_keys:localhost:regular1 \
            user "localhost" \
            type "regular" \
            grants_sql "true" \
            grants_maps "true" \
            database_role "test_windshaft_regular1" \
            database_password "regular1"

        HMSET api_keys:localhost:regular2 \
            user "localhost" \
            type "regular" \
            grants_sql "true" \
            grants_maps "false" \
            database_role "test_windshaft_publicuser" \
            database_password "public"

        HMSET api_keys:cartodb250user:4321 \
            user "localhost" \
            type "master" \
            grants_sql "true" \
            grants_maps "true" \
            database_role "${TEST_USER}" \
            database_password "${TEST_PASSWORD}"

        HMSET api_keys:cartodb250user:default_public \
            user "localhost" \
            type "default" \
            grants_sql "true" \
            grants_maps "true" \
            database_role "test_windshaft_publicuser" \
            database_password "public"
    `;

    await exec(`echo "${commands}" | redis-cli -p ${REDIS_PORT} -n 5`);
}

async function main (args) {
    let code = 0;

    try {
        switch (args[0]) {
        case 'setup':
            await startRedis();
            await populateRedis();
            await dropDatabase();
            await createDatabase();
            await createDatabaseExtension();
            await populateDatabase();
            break;
        case 'teardown':
            await stopRedis();
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
