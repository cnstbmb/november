#!/bin/sh

cd /srv/
docker-compose down
docker-compose pull
docker-compose up -d