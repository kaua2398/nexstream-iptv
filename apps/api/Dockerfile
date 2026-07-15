FROM node:22.16.0-alpine3.21 AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --filter @nexstream/api... --no-frozen-lockfile

FROM deps AS build
COPY apps/api apps/api
COPY packages/shared packages/shared
COPY prisma prisma
RUN pnpm --filter @nexstream/api prisma:generate && pnpm --filter @nexstream/api build

FROM node:22.16.0-alpine3.21 AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S nexstream && adduser -S -G nexstream nexstream
COPY --from=build --chown=nexstream:nexstream /app/node_modules ./node_modules
COPY --from=build --chown=nexstream:nexstream /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=nexstream:nexstream /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=nexstream:nexstream /app/prisma ./prisma
COPY --chown=nexstream:nexstream apps/api/entrypoint.sh ./entrypoint.sh
USER nexstream
EXPOSE 4000
CMD ["./entrypoint.sh"]
