#!/bin/sh

# this script prepare database and redis instance to run accpetance test

echo "preparing redis..."
echo "HSET rails:users:vizzuality id 1" | redis-cli -n 5
echo "HSET rails:users:vizzuality database_name cartodb_test_user_1_db" | redis-cli -n 5

echo "preparing postgres..."
dropdb -Upostgres -hlocalhost  cartodb_test_user_1_db
createdb -Upostgres -hlocalhost -Ttemplate_postgis -Opostgres -EUTF8 cartodb_test_user_1_db
psql -Upostgres -hlocalhost cartodb_test_user_1_db < windshaft.test.sql

echo "ok, you can run test now"


