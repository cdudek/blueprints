# syntax=docker/dockerfile:1
# One build per commit, promoted unchanged; configuration comes from the environment at start.
# Three targets from the same sources:
#   web      the Next.js standalone server           docker build --target web .
#   worker   the background queue (src/worker.ts)    docker build --target worker .
#   migrate  applies ./drizzle once, before traffic  docker build --target migrate .

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 HUSKY=0
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:22-slim AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]

FROM node:22-slim AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
COPY scripts/worker.mjs scripts/worker-hooks.mjs ./scripts/
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "scripts/worker.mjs"]

FROM node:22-slim AS migrate
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY drizzle ./drizzle
COPY scripts/db-migrate.mjs ./scripts/
USER node
CMD ["node", "scripts/db-migrate.mjs"]
