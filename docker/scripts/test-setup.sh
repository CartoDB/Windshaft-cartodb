#!/bin/bash

/etc/init.d/postgresql start

source /src/nodejs-install.sh

# Install cartodb-postgresql extension
git clone https://github.com/CartoDB/cartodb-postgresql.git
cd cartodb-postgresql && make && make install && cd ..

cp config/environments/test.js.example config/environments/test.js

npm ci
npm test
