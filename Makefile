all:
	npm install

clean:
	rm -rf node_modules/*

config/environments/test.js: config/environments/test.js.example
	./configure

check: config/environments/test.js
	./run_tests.sh
