#!/bin/sh

# Sorry, you must currently manually edit the regexp to make this work
# on your machine.

master_pid=$(ps xa | grep windshaft | grep -v local | grep -v grep | awk '{print $1}')

# TODO: use pid files
worker_pids=$(ps xa | grep windshaft | grep local | awk '{print $1}' |
  python -c "import sys; print ','.join((x.strip() for x in  sys.stdin.readlines()))")

if test -z "${worker_pids}"; then
  echo "No workers found"
  exit 1
fi

echo "Master: $master_pid"
echo "Workers: $worker_pids"

# TODO: use lsof only once, then grep in the report
for pid in $(echo $worker_pids | tr ',' ' '); do
        echo -n "worker $pid postgres: "
        lsof -p $pid | grep ':6432 .EST' | wc -l;

        echo -n "worker $pid redis: "
        lsof -p $pid | grep ':6379 .EST' | wc -l;

        echo -n "worker $pid incoming http: "
        lsof -p $pid | grep ':8181' | wc -l;

        echo -n "worker $pid total: "
        lsof -p $pid | wc -l;
done


echo -n "master $master_pid total: "
lsof -p $master_pid | grep node | wc -l;
