FROM node:24.20-bookworm-slim AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/china-career-radar/package.json apps/china-career-radar/package.json
RUN npm ci --workspace china-career-radar --include-workspace-root=false --ignore-scripts
COPY apps/china-career-radar apps/china-career-radar
WORKDIR /workspace/apps/china-career-radar
RUN npm run build

FROM node:24.20-bookworm-slim AS production-deps
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/china-career-radar/package.json apps/china-career-radar/package.json
RUN npm ci --workspace china-career-radar --include-workspace-root=false --omit=dev --ignore-scripts

FROM node:24.20-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-deps /workspace/node_modules /app/node_modules
COPY --from=production-deps /workspace/apps/china-career-radar/node_modules /app/node_modules
COPY --from=build /workspace/apps/china-career-radar/dist /app/dist
COPY --from=build /workspace/apps/china-career-radar/config /app/config
COPY --from=build /workspace/apps/china-career-radar/package.json /app/package.json
USER node
EXPOSE 3100
CMD ["node", "dist/main.js"]
