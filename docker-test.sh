#!/bin/bash

usage() {
    echo "Usage: $0"
    exit 1
}

echo "$0 $1"

DOCKER='nodejs10-xenial-pg101:postgis-2.4.4.5'

docker run -v `pwd`:/srv carto/${DOCKER} bash run_tests_docker.sh && \
    docker ps --filter status=dead --filter status=exited -aq | xargs docker rm -v
