all:
	npm install

clean:
	rm -rf node_modules/*

config/environments/test.js: config/environments/test.js.example
	./configure

check-local: config/environments/test.js
	./run_tests.sh

check-submodules:
	for sub in windshaft grainstore mapnik; do \
		test -e node_modules/$${sub} && make -C node_modules/$${sub} check; \
	done

check-full: check-local check-submodules

check: check-local
