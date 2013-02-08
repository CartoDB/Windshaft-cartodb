#!/bin/sh

http_port=8181
db_port=6432
redis_port=6379

pids=$(lsof -i :${http_port} | grep LISTEN | awk '{print $2}')
nworkers=$(echo "${pids}" | wc -l)
pids=$(echo "${pids}" | paste -sd ' ')

tmpreport="/tmp/checkfd.$$.txt"

lsof -p $(echo "${pids}" | tr ' ' ',') > "${tmpreport}"

maxdb=0
maxredis=0
maxhttp=0
maxtot=0

for pid in ${pids}; do

  cnt=$(grep "${pid}" "${tmpreport}" | grep ":${db_port} " | wc -l);
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
