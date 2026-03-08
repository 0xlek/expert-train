FROM oven/bun:alpine AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY src ./src
COPY tsconfig.json ./
RUN bun build src/index.ts --compile --outfile=proxy-server

FROM oven/bun:alpine
COPY --from=build /app/proxy-server /usr/local/bin/proxy-server
EXPOSE 8080
EXPOSE 8081
CMD ["proxy-server"]
