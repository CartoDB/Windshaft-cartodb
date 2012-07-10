all:
	npm install

clean:
	rm -rf node_modules/*

check:
	./run_tests.sh
