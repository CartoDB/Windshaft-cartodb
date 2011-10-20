#!/bin/sh

# this script prepare database and redis instance to run accpetance test

echo "preparing redis..."
echo "HSET rails:users:vizzuality id 1" | redis-cli -n 5
echo "HSET rails:users:vizzuality database_name windshaft" | redis-cli -n 5

echo "preparing postgres..."
dropdb -Upostgres -hlocalhost  whindshaft_test
createdb -Upostgres -hlocalhost -Ttemplate_postgis -Opostgres -EUTF8 whindshaft_test
psql -Upostgres -hlocalhost whindshaft_test < test.sql

echo "ok, you can run test now"


