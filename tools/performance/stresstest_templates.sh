#!/bin/sh

verbose=no
tiler_url=http://dev.localhost.lan:8181/tiles/template
apikey=${CDB_APIKEY}

while test -n "$1"; do
  if test "$1" = "-k"; then
    shift
    apikey="$1"
  elif test "$1" = "-u"; then
    shift
    tiler_url="$1"
  elif test -z "$tpl"; then
    tpl="$1"
  else
    echo "Unused parameter $1" >&2
  fi
  shift
done

if test -z "$tpl"; then
  echo "Usage: $0 [-v] [-k <api_key>] [-u <tiler_url>] <template_config>" >&2
  echo "Default <tiler_url> is ${tiler_url}" >&2
  echo "Default <api_key> is read from CDB_APIKEY env variable" >&2
  exit 1
fi

basedir=$(cd $(dirname $0); cd ..; pwd)
export CDB_APIKEY=${apikey}
max=3000000
i=0
while test "$i" -le "$max"; do
  tpln=`cat ${tpl} | sed "s/\"name\":\"\(.*\)\"/\"name\":\"\1${i}\"/"`
  tpl_id=`echo ${tpln} | ${basedir}/create_template -u ${tiler_url} /dev/stdin`
  if test $? -ne 0; then
    echo $tpl_id >&2
    break
  fi
  tpl_id=`echo ${tpln} | ${basedir}/update_template -u ${tiler_url} ${tpl_id} /dev/stdin`
  if test $? -ne 0; then
    echo $tpl_id >&2
    break
  fi
  out=`${basedir}/delete_template -u ${tiler_url} ${tpl_id}`
  if test $? -ne 0; then
    echo $out >&2
    break
  fi
  i=$((i+1))
  if test `expr $i % 100` -eq 0; then
    echo -n "."
  fi
done
