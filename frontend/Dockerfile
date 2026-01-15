FROM node:20.19.6-alpine AS build
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build:prod

FROM nginxinc/nginx-unprivileged:stable

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist/frontend  /usr/share/nginx/html
