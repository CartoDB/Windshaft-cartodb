#!/bin/bash

/etc/init.d/postgresql start

source /src/nodejs-install.sh

echo "Node.js version: "
node -v

# install dependencies
if [ "$NODEJS_VERSION" = "6" ];
then
    npm install -g yarn@0.27.5
    echo "yarn version on install:"
    yarn --version
    yarn
else
    echo "npm version:"
    npm -v
    npm ci
    npm ls
fi

# run tests
npm test
