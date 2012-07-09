#!/bin/sh

# this script prepare database and redis instance to run accpetance test
#
# NOTE: assumes existance of a "template_postgis"
# NOTE2: use PG* environment variables to control who and where
#
# NOTE3: a side effect of the db preparation is the persistent creation
#        of two database roles which will be valid for the whole cluster
#        TODO: fix that
#

die() {
        msg=$1
        echo "${msg}" >&2
        exit 1
}

TEST_DB="cartodb_test_user_1_db"

echo "preparing redis..."
echo "HSET rails:users:vizzuality id 1" | redis-cli -n 5
echo "HSET rails:users:vizzuality database_name '${TEST_DB}'" | redis-cli -n 5
echo 'HSET rails:${TEST_DB}:my_table infowindow "this, that, the other"' | redis-cli -n 0

echo "preparing postgres..."
dropdb "${TEST_DB}"
createdb -Ttemplate_postgis -EUTF8 "${TEST_DB}" || die "Could not create test database"
psql "${TEST_DB}" < ./sql/windshaft.test.sql
psql "${TEST_DB}" < ./sql/gadm4.sql

echo "Finished preparing data. Run tests with expresso."
