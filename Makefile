SHELL=/bin/bash

pre-install:
	@$(SHELL) ./scripts/check-node-canvas.sh

all:
	@$(SHELL) ./scripts/install.sh

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
	@$(SHELL) ./run_tests.sh ${RUNTESTFLAGS} \
		test/unit/cartodb/*.js \
		test/unit/cartodb/cache/model/*.js \
		test/integration/*.js \
		test/acceptance/*.js \
		test/acceptance/cache/*.js

jshint:
	@echo "***jshint***"
	@./node_modules/.bin/jshint lib/

test-all: jshint test

check: test

.PHONY: pre-install test
