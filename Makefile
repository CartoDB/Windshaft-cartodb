srcdir=$(shell pwd)

all:
	npm install

clean:
	rm -rf node_modules/*

distclean: clean
	rm config.status*

config.status--test:
	./configure --environment=test

config/environments/test.js: config.status--test
	./config.status--test 

check-local: config/environments/test.js
	./run_tests.sh ${RUNTESTFLAGS} \
    test/unit/cartodb/req2params.test.js \
    test/acceptance/cache_validator.js \
    test/acceptance/server.js \
    test/acceptance/multilayer.js

check-submodules:
	PATH="$$PATH:$(srcdir)/node_modules/.bin/"; \
	for sub in windshaft grainstore node-varnish mapnik; do \
	  if test -e node_modules/$${sub}; then \
	      echo "Testing submodule $${sub}"; \
	      make -C node_modules/$${sub} check || exit 1; \
	  fi; \
	done

check-full: check-local check-submodules

check: check-local

