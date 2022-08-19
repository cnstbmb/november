FROM node:16.0.0-alpine AS builder

WORKDIR /home/app/server

COPY ./package.json ./package.json

COPY . .

WORKDIR /home/app/server

RUN npm i
RUN node ./node_modules/typescript/bin/tsc

FROM builder as clean
WORKDIR /home/app/server
RUN rm -rf node_modules

FROM node:16.0.0-alpine

WORKDIR /home/app/server

COPY --from=builder /home/app/server/node_modules node_modules
COPY --from=clean /home/app/server/compiled .
COPY --from=clean /home/app/server/package.json .
COPY --from=clean /home/app/server/package-lock.json .
COPY --from=clean /home/app/server/tools/scripts/run_prod.sh .
COPY --from=clean /home/app/server/tools/scripts/add-user-prod.sh .
COPY --from=clean /home/app/server/migrations ./migrations

ENV PORT 3000
ENV NODE_ENV prod
ENV LOG_TO_FILE /home/app/server/logs
ENV PRETTY_LOGS 1

EXPOSE 3000

RUN apk --update add postgresql-client

CMD ["./run_prod.sh"]