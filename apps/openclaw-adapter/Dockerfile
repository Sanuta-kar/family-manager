FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/openclaw-adapter/package.json apps/openclaw-adapter/package.json
RUN pnpm install --no-frozen-lockfile

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/openclaw-adapter apps/openclaw-adapter
RUN pnpm --filter @family-manager/shared build
RUN pnpm --filter @family-manager/openclaw-adapter build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/openclaw-adapter/dist apps/openclaw-adapter/dist
CMD ["node", "apps/openclaw-adapter/dist/apps/openclaw-adapter/src/main.js"]
