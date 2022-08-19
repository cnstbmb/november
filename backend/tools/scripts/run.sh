#!/bin/sh

SCRIPTPATH="$( cd "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

node $SCRIPTPATH/../../compiled/index.js | $SCRIPTPATH/../../node_modules/pino-pretty/bin.js --colorize --translateTime