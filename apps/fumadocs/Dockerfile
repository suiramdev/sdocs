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

RUN if command -v apt-get >/dev/null 2>&1; then \
      apt-get update && \
      apt-get install -y --no-install-recommends git && \
      rm -rf /var/lib/apt/lists/*; \
    elif command -v apk >/dev/null 2>&1; then \
      apk add --no-cache git; \
    else \
      echo "Unsupported package manager: unable to install git" >&2; \
      exit 1; \
    fi

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=4000

COPY --from=build /app ./

EXPOSE 4000

CMD ["bun", "run", "start"]
