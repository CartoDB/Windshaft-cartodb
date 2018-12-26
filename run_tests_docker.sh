#!/bin/bash

usage() {
    /etc/init.d/postgresql stop
    echo "Usage: $0"
    exit 1
}

echo "$0 $1"

# start PostgreSQL
/etc/init.d/postgresql start

echo "Node.js version:"
node -v

echo "npm version:"
npm -v
npm ci
npm ls

npm test
