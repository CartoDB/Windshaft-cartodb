all:
	npm install

clean:
	rm -rf node_modules/*

config/environments/test.js: config/environments/test.js.example
	./configure

check: config/environments/test.js
	./run_tests.sh ${RUNTESTFLAGS} \
    test/unit/cartodb/redis_pool.test.js \
    test/unit/cartodb/req2params.test.js \
    test/acceptance/cache_validator.js \
    test/acceptance/server.js
