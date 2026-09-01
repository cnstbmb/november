FROM node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e

WORKDIR /app
COPY package.json /app/package.json
COPY src /app/src

ENV NODE_ENV=production \
    NODE_OPTIONS=--no-deprecation

USER 10002:10002
ENTRYPOINT ["node", "/app/src/index.js"]
