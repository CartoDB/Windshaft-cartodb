#!/bin/sh

# this script prepare database and redis instance to run accpetance test
#
# NOTE: assumes existance of a "template_postgis"
# NOTE2: use PG* environment variables to control who and where

die() {
        msg=$1
        echo "${msg}" >&2
        exit 1
}

echo "preparing redis..."
echo "HSET rails:users:vizzuality id 1" | redis-cli -n 5
echo "HSET rails:users:vizzuality database_name cartodb_test_user_1_db" | redis-cli -n 5
echo 'HSET rails:cartodb_test_user_1_db:my_table infowindow "this, that, the other"' | redis-cli -n 0

echo "preparing postgres..."
dropdb cartodb_test_user_1_db
createdb -Ttemplate_postgis -EUTF8 cartodb_test_user_1_db || die "Could not create test database"
psql cartodb_test_user_1_db < ./sql/windshaft.test.sql
psql cartodb_test_user_1_db < ./sql/gadm4.sql

echo "Finished preparing data. Run tests with expresso."
