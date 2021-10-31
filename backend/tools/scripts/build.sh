#!/bin/bash

SCRIPTPATH="$( cd "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

env

start=`date +%s`
echo "start building project"

cd $SCRIPTPATH/../../

node ./node_modules/typescript/bin/tsc

end=`date +%s`
runtime=$((end-start))

echo "Building time $((runtime / 60)) minutes and $((runtime % 60)) seconds."