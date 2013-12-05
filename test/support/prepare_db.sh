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

PREPARE_REDIS=yes
PREPARE_PGSQL=yes

while [ -n "$1" ]; do
  if test "$1" = "--skip-pg"; then
    PREPARE_PGSQL=no
    shift; continue
  elif test "$1" = "--skip-redis"; then
    PREPARE_REDIS=no
    shift; continue
  fi
done

die() {
        msg=$1
        echo "${msg}" >&2
        exit 1
}

# This is where postgresql connection parameters are read from
TESTENV=../../config/environments/test.js
if [ \! -r ${TESTENV} ]; then
  echo "Cannot read ${TESTENV}" >&2
  exit 1
fi

TESTUSERID=1

TESTUSER=`node -e "console.log(require('${TESTENV}').postgres_auth_user || '')"`
if test -z "$TESTUSER"; then
  echo "Missing postgres_auth_user from ${TESTENV}" >&2
  exit 1
fi
TESTUSER=`echo ${TESTUSER} | sed "s/<%= user_id %>/${TESTUSERID}/"`

TESTPASS=`node -e "console.log(require('${TESTENV}').postgres_auth_pass || 'test')"`
# TODO: should postgres_auth_pass be optional ?
if test -z "$TESTPASS"; then
  echo "Missing postgres_auth_pass from ${TESTENV}" >&2
  exit 1
fi
TESTPASS=`echo ${TESTPASS} | sed "s/<%= user_id %>/${TESTUSERID}/"`

TEST_DB="${TESTUSER}_db"

# NOTE: will be set by caller trough environment
if test -z "$REDIS_PORT"; then REDIS_PORT=6333; fi

PUBLICUSER=`node -e "console.log(require('${TESTENV}').postgres.user || 'xxx')"`
PUBLICPASS=`node -e "console.log(require('${TESTENV}').postgres.password || 'xxx')"`
echo "PUBLICUSER: ${PUBLICUSER}"
echo "PUBLICPASS: ${PUBLICPASS}"
echo "TESTUSER: ${TESTUSER}"
echo "TESTPASS: ${TESTPASS}"

if test x"$PREPARE_PGSQL" = xyes; then

  echo "preparing postgres..."
  dropdb "${TEST_DB}"
  createdb -Ttemplate_postgis -EUTF8 "${TEST_DB}" || die "Could not create test database"

  cat sql/windshaft.test.sql sql/gadm4.sql |
    sed "s/:PUBLICUSER/${PUBLICUSER}/" | 
    sed "s/:PUBLICPASS/${PUBLICPASS}/" | 
    sed "s/:TESTUSER/${TESTUSER}/" | 
    sed "s/:TESTPASS/${TESTPASS}/" | 
    psql ${TEST_DB}

fi

if test x"$PREPARE_REDIS" = xyes; then

  echo "preparing redis..."
  echo "HSET rails:users:localhost id ${TESTUSERID}" | redis-cli -p ${REDIS_PORT} -n 5
  echo 'HSET rails:users:localhost database_name "'"${TEST_DB}"'"' | redis-cli -p ${REDIS_PORT} -n 5
  echo "HSET rails:users:localhost map_key 1234" | redis-cli -p ${REDIS_PORT} -n 5
  echo "SADD rails:users:localhost:map_key 1235" | redis-cli -p ${REDIS_PORT} -n 5

  # A user configured as with cartodb-2.5.0+ 
  echo "HSET rails:users:cartodb250user id ${TESTUSERID}" | redis-cli -p ${REDIS_PORT} -n 5
  echo 'HSET rails:users:cartodb250user database_name "'${TEST_DB}'"' | redis-cli -p ${REDIS_PORT} -n 5
  echo 'HSET rails:users:cartodb250user database_host "localhost"' | redis-cli -p ${REDIS_PORT} -n 5
  echo 'HSET rails:users:cartodb250user database_password "'${TESTPASS}'"' | redis-cli -p ${REDIS_PORT} -n 5
  echo "HSET rails:users:cartodb250user map_key 4321" | redis-cli -p ${REDIS_PORT} -n 5

  echo 'HSET rails:'"${TEST_DB}"':my_table infowindow "this, that, the other"' | redis-cli -p ${REDIS_PORT} -n 0
  echo 'HSET rails:'"${TEST_DB}"':test_table_private_1 privacy "0"' | redis-cli -p ${REDIS_PORT} -n 0

fi

echo "Finished preparing data. Ready to run tests"

