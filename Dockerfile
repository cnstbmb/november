FROM node:16.0.0-alpine AS builder

WORKDIR /usr/src/app

ENV PORT 3000
ENV NODE_ENV prod
ENV LOG_TO_FILE /usr/src/app/logs
ENV PRETTY_LOGS 1

COPY ./backend/compiled/ .
COPY ./backend/node_modules/ ./node_modules

EXPOSE 3000
CMD [ "node", "index.js" ]
