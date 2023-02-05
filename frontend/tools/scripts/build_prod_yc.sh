#!/bin/sh

# TODO: get from env cr.yandex id

SCRIPTPATH="$( cd "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

env

SCRIPT_START_TIME=`date +%s`
echo "start building frontend production docker image"

cd $SCRIPTPATH/../..

TIMESTAMP=$(date +%s)
IMAGE_NAME="cr.yandex/$YC_REGISTRY_ID/khimenkov-angular-app"
TAG_NEW="$IMAGE_NAME:$TIMESTAMP"
TAG_LATEST="$IMAGE_NAME:latest"

docker build --no-cache -t $TAG_LATEST -t $TAG_NEW .

docker push $TAG_LATEST
docker push $TAG_NEW

SCRIPT_END_TIME=`date +%s`

RUNTIME=$((SCRIPT_END_TIME-SCRIPT_START_TIME))
echo "Building docker image and push time $((RUNTIME / 60)) minutes and $((RUNTIME % 60)) seconds."
