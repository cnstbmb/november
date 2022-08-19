#!/bin/sh

SCRIPTPATH="$( cd "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

env

start=`date +%s`
echo "start building project"

cd $SCRIPTPATH/../../

rm -rf compiled
#rm -rf compiled/configs
node ./node_modules/typescript/bin/tsc
cp -r ./configs ./compiled/configs

end=`date +%s`
runtime=$((end-start))

echo "Building time $((runtime / 60)) minutes and $((runtime % 60)) seconds."