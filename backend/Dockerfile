FROM node:22-alpine AS build

RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm install --frozen-lockfile

COPY backend backend
RUN pnpm --dir backend build
# Dedicated deploy lockfile: do not resolve newer versions after compiling.
RUN pnpm --filter @thien-minh-dental/backend deploy --prod --config.inject-workspace-packages=true --offline /output/backend

FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3001
WORKDIR /app

COPY --chown=node:node --from=build /output/backend/ ./
COPY --chown=node:node --from=build /workspace/backend/dist ./dist

RUN mkdir -p /data/evidence/attendance /data/evidence/business-trips \
    && chown -R node:node /data

USER node
EXPOSE 3001

CMD ["sh", "-c", "node dist/database/run-migrations.js && exec node dist/main.js"]
