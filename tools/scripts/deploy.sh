#!/bin/bash

SCRIPTPATH="$( cd "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

env

script_start_time=`date +%s`
echo "start building production docker image"

build_backend_start_time=`date +%s`
cd $SCRIPTPATH/../..
docker build --no-cache -t cnstbmb/khimenkov-site .
docker push cnstbmb/khimenkov-site:latest
script_end_time=`date +%s`

runtime=$((script_end_time-script_start_time))
echo "Building docker image and push time $((runtime / 60)) minutes and $((runtime % 60)) seconds."