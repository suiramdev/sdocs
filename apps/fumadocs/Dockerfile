# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.5 AS deps
WORKDIR /app

COPY apps/fumadocs/package.json ./package.json

RUN bun install --ignore-scripts

FROM oven/bun:1.3.5 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY apps/fumadocs/ ./

RUN bun run build

FROM oven/bun:1.3.5 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=4000

COPY --from=build /app ./

EXPOSE 4000

CMD ["bun", "run", "start"]
