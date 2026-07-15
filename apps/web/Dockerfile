FROM node:22.16.0-alpine3.21 AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --filter @nexstream/web... --no-frozen-lockfile

FROM deps AS build
ARG API_INTERNAL_URL=http://api:4000/api
ENV API_INTERNAL_URL=$API_INTERNAL_URL
COPY apps/web apps/web
COPY packages/shared packages/shared
RUN pnpm --filter @nexstream/web build

FROM node:22.16.0-alpine3.21 AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
RUN addgroup -S nexstream && adduser -S -G nexstream nexstream
COPY --from=build --chown=nexstream:nexstream /app/apps/web/.next/standalone ./
COPY --from=build --chown=nexstream:nexstream /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nexstream:nexstream /app/apps/web/public ./apps/web/public
USER nexstream
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
