all:
	@sh ./scripts/install.sh

clean:
	rm -rf node_modules/*

distclean: clean
	rm config.status*

config.status--test:
	./configure --environment=test

config/environments/test.js: config.status--test
	./config.status--test 

test: config/environments/test.js
	@echo "***tests***"
	./run_tests.sh ${RUNTESTFLAGS} \
	test/unit/cartodb/*.js \
	test/unit/cartodb/cache/model/*.js \
	test/integration/*.js \
	test/acceptance/*.js \
	test/acceptance/cache/*.js

check: test

.PHONY: test
