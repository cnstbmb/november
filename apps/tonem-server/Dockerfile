# syntax=docker/dockerfile:1

# ── Build stage ──────────────────────────────────────────────────────────────
# Context: repository root (npm workspaces hoist deps to the root node_modules).
FROM node:22-alpine AS build
WORKDIR /repo

# Copy workspace manifests first for layer caching.
COPY package.json package-lock.json ./
COPY apps/tonem-server/package.json apps/tonem-server/package.json

# Install the full workspace (hoists @prisma/client + nest deps to root).
RUN npm ci

# Copy the tonem-server sources + prisma schema, generate client, compile.
COPY apps/tonem-server apps/tonem-server
RUN npm --workspace tonem-server run prisma:generate \
  && npm --workspace tonem-server run build

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo

# Hoisted production deps + the compiled app + prisma assets.
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/tonem-server/package.json ./apps/tonem-server/package.json
COPY --from=build /repo/apps/tonem-server/dist ./apps/tonem-server/dist
COPY --from=build /repo/apps/tonem-server/prisma ./apps/tonem-server/prisma

WORKDIR /repo/apps/tonem-server
EXPOSE 3200

# Apply migrations then start the collector + API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
