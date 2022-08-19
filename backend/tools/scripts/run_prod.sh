#!/bin/sh

SCRIPTPATH="$( cd "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

until PGPASSWORD=$POSTGRES_PASSWORD psql -h "$DATABASE_ADDR" -d "$POSTGRES_DB" -U "$POSTGRES_USER" -c '\q'; do
  >&2 echo "Postgres is unavailable - sleeping"
  sleep 1
done

>&2 echo "Postgres is up - starting nodejs server"

node $SCRIPTPATH/node_modules/db-migrate/bin/db-migrate --verbose --config $SCRIPTPATH/configs/database.json up

node $SCRIPTPATH/index.js | $SCRIPTPATH/node_modules/pino-pretty/bin.js --colorize --translateTime