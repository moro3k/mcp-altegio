FROM oven/bun:1-alpine AS base
WORKDIR /app

# Dependencies
FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Production
FROM base AS release
COPY --from=install /app/node_modules ./node_modules
COPY src ./src
COPY tsconfig.json package.json ./
USER bun
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
