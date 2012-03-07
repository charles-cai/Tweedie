#! /bin/sh

DIR=$(dirname $0)
if test x$1 != x; then
  FILE=$1/all.js
else
  FILE=$DIR/all.js
fi

cat $DIR/libs/phonegap*.js $DIR/libs/ChildBrowser.js > $FILE
for i in $(grep -o "[a-zA-z0-9./\-]*\.js" $DIR/../desktop.html)
do
  cat $DIR/../$i >> $FILE
done
cat $DIR/../resources/resources.js >> $FILE
