#!/bin/sh

# Must match config.redis_pool.port in test/support/config.js
REDIS_PORT=6333

cleanup() {
	echo "Cleaning up"
	kill ${PID_REDIS}
}

cleanup_and_exit() {
	cleanup
	exit
}

die() {
	msg=$1
	echo "${msg}" >&2
	cleanup
	exit 1
}

trap 'cleanup_and_exit' 1 2 3 5 9 13

echo "Starting redis on port ${REDIS_PORT}"
echo "port ${REDIS_PORT}" | redis-server - > test.log &
PID_REDIS=$!

echo "Preparing the database"
cd test; sh prepare_db.sh >> test.log || die "database preparation failure (see test.log)"; cd -;

PATH=node_modules/.bin/:$PATH

echo "Running tests"
mocha -u tdd \
  test/unit/cartodb/redis_pool.test.js \
  test/acceptance/cache_validator.js \
  test/acceptance/server.js


cleanup
