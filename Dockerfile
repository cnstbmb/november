FROM node:16.0.0-alpine AS builder

WORKDIR /home/app/server

COPY ./tools/scripts/build_prod.sh ./tools/scripts/build_prod.sh
COPY ./package.json ./package.json

COPY frontend frontend
COPY backend backend

WORKDIR /home/app/server/backend

RUN npm i
RUN node ./node_modules/typescript/bin/tsc

WORKDIR /home/app/server/frontend
RUN npm i
RUN npm run build:prod
RUN cp -r dist/** ../backend/compiled/static

FROM builder as clean
WORKDIR /home/app/server
RUN rm -rf node_modules


FROM node:16.0.0-alpine

WORKDIR /home/app/server

COPY --from=builder /home/app/server/backend/node_modules node_modules
COPY --from=clean /home/app/server/backend/compiled .

ENV PORT 3000
ENV NODE_ENV prod
ENV LOG_TO_FILE /home/app/server/logs
ENV PRETTY_LOGS 1

EXPOSE 3000
CMD [ "node", "index.js" ]
