#!/bin/sh

# this script prepare database and redis instance to run accpetance test
# Note: requires a postgis template called template_postgis

echo "preparing redis..."
echo "HSET rails:users:vizzuality id 1" | redis-cli -n 5
echo "HSET rails:users:vizzuality database_name cartodb_test_user_1_db" | redis-cli -n 5
echo 'HSET rails:cartodb_test_user_1_db:my_table infowindow "this, that, the other"' | redis-cli -n 0

echo "preparing postgres..."
dropdb -Upostgres -hlocalhost  cartodb_test_user_1_db
createdb -Upostgres -hlocalhost -Ttemplate_postgis -Opostgres -EUTF8 cartodb_test_user_1_db
psql -Upostgres -hlocalhost cartodb_test_user_1_db < ./sql/windshaft.test.sql
psql -Upostgres -hlocalhost cartodb_test_user_1_db < ./sql/gadm4.sql

echo "Finished preparing data. Run tests with expresso."
