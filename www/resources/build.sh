#! /bin/sh

if test x$1 != x; then
  FILE=$1/resources.js
else
  FILE=$(dirname $0)/resources.js
fi
DIR=$(dirname $0)

echo "var __resources = {" > $FILE
for i in $DIR/*.html
do
  data=$(cat $i | sed s/\'/\\\\\'/g | sed s/$/\\\\/)
  name=$(basename $i .html)
  echo "'$name': '${data:0:${#data}-1}'," >> $FILE
done
echo "'_':null};" >> $FILE
