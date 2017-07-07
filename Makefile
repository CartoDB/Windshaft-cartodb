SHELL=/bin/bash

pre-install:
	@$(SHELL) ./scripts/check-node-canvas.sh

all:
	@$(SHELL) ./scripts/install.sh

clean:
	rm -rf node_modules/

distclean: clean
	rm config.status*

config.status--test:
	./configure --environment=test

config/environments/test.js: config.status--test
	./config.status--test 

TEST_SUITE := $(shell find test/{acceptance,integration,unit} -name "*.js")
TEST_SUITE_UNIT := $(shell find test/unit -name "*.js")
TEST_SUITE_INTEGRATION := $(shell find test/integration -name "*.js")
TEST_SUITE_ACCEPTANCE := $(shell find test/acceptance/widgets/ported -name "*.js")

test: config/environments/test.js
	@echo "***tests***"
	@$(SHELL) ./run_tests.sh ${RUNTESTFLAGS} $(TEST_SUITE)

test-unit: config/environments/test.js
	@echo "***tests***"
	@$(SHELL) ./run_tests.sh ${RUNTESTFLAGS} $(TEST_SUITE_UNIT)

test-integration: config/environments/test.js
	@echo "***tests***"
	@$(SHELL) ./run_tests.sh ${RUNTESTFLAGS} $(TEST_SUITE_INTEGRATION)

test-acceptance: config/environments/test.js
	@echo "***tests***"
	@$(SHELL) ./run_tests.sh ${RUNTESTFLAGS} $(TEST_SUITE_ACCEPTANCE)

jshint:
	@echo "***jshint***"
	@./node_modules/.bin/jshint lib/ test/ app.js

test-all: test jshint

coverage:
	@RUNTESTFLAGS=--with-coverage make test

check: test

.PHONY: pre-install test jshint coverage
