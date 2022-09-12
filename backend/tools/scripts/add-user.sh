#!/bin/sh

SCRIPTPATH="$( cd "$(dirname "$0")" >/dev/null 2>&1 || exit ; pwd -P )"

node $SCRIPTPATH/../../compiled/bin/add-user.js
#node $SCRIPTPATH/../../compiled/bin/add-user.js | $SCRIPTPATH/../../node_modules/pino-pretty/bin.js --colorize --translateTime