#!/bin/sh

SCRIPTPATH="$( cd "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

env

SCRIPT_START_TIME=`date +%s`
echo "start building production application"

echo "start building backend production"
BUILD_BACKEND_START_TIME=`date +%s`
cd $SCRIPTPATH/../../backend
npm run build:docker:prod:yc
BUILD_BACKEND_END_TIME=`date +%s`
BUILD_BACKEND_TIME=$((BUILD_BACKEND_END_TIME-BUILD_BACKEND_START_TIME))
echo "backend built successful after $((BUILD_BACKEND_TIME / 60)) minutes and $((BUILD_BACKEND_TIME % 60)) seconds."

echo "start building frontend production"
BUILD_FRONTEND_START_TIME=`date +%s`
cd $SCRIPTPATH/../../frontend
npm run build:docker:prod:yc
BUILD_FRONTEND_END_TIME=`date +%s`
BUILD_FRONTEND_TIME=$((BUILD_FRONTEND_END_TIME-BUILD_FRONTEND_START_TIME))
echo "frontend built successful after $((BUILD_FRONTEND_TIME / 60)) minutes and $((BUILD_FRONTEND_TIME % 60)) seconds."

echo "start copying angular application to './static' backend"
cp -r dist/** $SCRIPTPATH/../../backend/compiled/static

SCRIPT_END_TIME=`date +%s`
RUNTIME=$((SCRIPT_END_TIME-SCRIPT_START_TIME))
echo "Building time $((RUNTIME / 60)) minutes and $((RUNTIME % 60)) seconds."