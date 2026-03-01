FROM oven/bun:alpine AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY src ./src
COPY tsconfig.json ./
RUN bun build src/index.ts --compile --outfile=rss-proxy

FROM debian:bookworm-slim
COPY --from=build /app/rss-proxy /usr/local/bin/rss-proxy
EXPOSE 3000
CMD ["rss-proxy"]
