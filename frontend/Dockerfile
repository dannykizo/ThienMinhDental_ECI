FROM node:22-alpine AS build

RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm install --frozen-lockfile

COPY frontend frontend
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN pnpm --dir frontend build
RUN pnpm --filter @thien-minh-dental/frontend deploy --prod --legacy /output/frontend

FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

COPY --chown=node:node --from=build /output/frontend/ ./
COPY --chown=node:node --from=build /workspace/frontend/.next ./.next

USER node
EXPOSE 3000

CMD ["npm", "run", "start"]
