#!/bin/sh

me=$0
if test -h "$me"; then
  me=`readlink $me`
fi
ENV_DIR=$(cd `dirname "$me"`/../config/environments || exit 1; pwd)

if test -z "$TILER_ENVIRONMENT"; then
  TILER_ENVIRONMENT=${ENV_DIR}/development.js
fi

if test "$1" = "config"; then
cat <<'EOM'
graph_title Tiler fd usage
graph_vlabel tiler fds
procs.label Number of tiler processes
pgsql.label PostgreSQL connections (max)
redis.label Redis connections (max)
http.label Incoming http requests (max)
nfd.label Number of open file descriptors (max)
EOM
exit 0
elif test x"$1" != "x"; then
  # override env file
  TILER_ENVIRONMENT="${ENV_DIR}/${1}.js"
fi

http_port=$(echo "console.log(require('${TILER_ENVIRONMENT}').port)" | node) || exit 1
pgsql_port=$(echo "console.log(require('${TILER_ENVIRONMENT}').postgres.port)" | node) || exit 1
redis_port=$(echo "console.log(require('${TILER_ENVIRONMENT}').redis.port)" | node) || exit 1

pids=$(lsof -i :${http_port} | grep LISTEN | awk '{print $2}')
nworkers=$(echo "${pids}" | wc -l)
pids=$(echo "${pids}" | paste -sd ' ')

if test -z "${pids}"; then
  echo "No processes found listening on tcp port '${http_port}'" >&2
  exit 1
fi

tmpreport="/tmp/checkfd.$$.txt"

lsof -p $(echo "${pids}" | tr ' ' ',') > "${tmpreport}"

maxdb=0
maxredis=0
maxhttp=0
maxtot=0

for pid in ${pids}; do

  cnt=$(grep "${pid}" "${tmpreport}" | grep ":${pgsql_port} " | wc -l);
  if test $cnt -gt $maxdb; then maxdb=$cnt; fi
  
  cnt=$(grep "${pid}" "${tmpreport}" | grep ":${redis_port} " | wc -l);
  if test $cnt -gt $maxredis; then maxredis=$cnt; fi

  cnt=$(grep "${pid}" "${tmpreport}" | grep ":${http_port} " | grep -v "LISTEN" | wc -l);
  if test $cnt -gt $maxhttp; then maxhttp=$cnt; fi

  cnt=$(grep "${pid}" "${tmpreport}" | wc -l);
  if test $cnt -gt $maxtot; then maxtot=$cnt; fi

done

echo "procs.value ${nworkers}"
echo "pgsql.value ${maxdb}"
echo "redis.value ${maxredis}"
echo "http.value ${maxhttp}"
echo "nfd.value ${maxtot}"

rm -f "${tmpreport}"
