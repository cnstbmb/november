#!/bin/sh

SCRIPTPATH="$( cd "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

env

script_start_time=`date +%s`
echo "start building production application"

echo "start building backend production"
build_backend_start_time=`date +%s`
cd $SCRIPTPATH/../../backend
npm run build
build_backend_end_time=`date +%s`
build_backend_time=$((build_backend_end_time-build_backend_start_time))
echo "backend built successful after $((build_backend_time / 60)) minutes and $((build_backend_time % 60)) seconds."

echo "start building frontend production"
build_frontend_start_time=`date +%s`
cd $SCRIPTPATH/../../frontend
# npm run build:prod
npm run build:docker:prod
build_frontend_end_time=`date +%s`
build_frontend_time=$((build_frontend_end_time-build_frontend_start_time))
echo "frontend built successful after $((build_frontend_time / 60)) minutes and $((build_frontend_time % 60)) seconds."

echo "start copying angular application to './static' backend"
cp -r dist/** $SCRIPTPATH/../../backend/compiled/static

script_end_time=`date +%s`
runtime=$((script_end_time-script_start_time))
echo "Building time $((runtime / 60)) minutes and $((runtime % 60)) seconds."