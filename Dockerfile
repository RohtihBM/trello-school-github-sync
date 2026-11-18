# One image definition for all three Node services. Build it three times with
# a different APP (Backend, Websockets or Worker) — see docker-compose.yml.
FROM node:22-bookworm-slim

# git: the Worker clones the repositories boards point at.
# openssl + ca-certificates: Prisma's engine and HTTPS calls (GitHub, Neon).
RUN apt-get update \
 && apt-get install -y --no-install-recommends git openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Skip onnxruntime's optional CUDA download; the CPU runtime ships in the
# package itself, which is all the embedding model needs.
ENV ONNXRUNTIME_NODE_INSTALL=skip

# Dependency layer first, so code edits don't reinstall everything. The
# lockfile is deliberately not copied: it is generated on macOS and misses
# Linux-only optional binaries (the lesson from the first Render deploys).
COPY package.json ./
COPY apps/Backend/package.json apps/Backend/
COPY apps/Websockets/package.json apps/Websockets/
COPY apps/Worker/package.json apps/Worker/
COPY packages/db/package.json packages/db/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/eslint-config/package.json packages/eslint-config/
RUN npm install --include=optional

COPY packages packages
COPY apps/Backend apps/Backend
COPY apps/Websockets apps/Websockets
COPY apps/Worker apps/Worker
# prisma.config.ts insists DATABASE_URL exists even though `generate` never
# connects. A throwaway value for this one step only; the real URL is supplied
# when the container runs.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm run generate --workspace=packages/db

ARG APP
ENV APP=${APP}
ENV NODE_ENV=production
# Shell form so $APP is expanded at start. Services run through tsx, exactly
# as `npm run start` does on Render, because @repo/db is raw TypeScript.
CMD npm run start --workspace=apps/$APP
