import { WebshareProvider } from "./webshare-provider";
import { ProxyManager } from "./proxy-manager";
import { DomainRouter } from "./domain-router";
import { ProxyHTTPClient } from "./proxy-http-client";
import { createHandler } from "./server";
import { createLogger } from "./logger";

const log = createLogger("main");

const apiKey = process.env.WEBSHARE_API_KEY;
if (!apiKey) {
  log.error("WEBSHARE_API_KEY is required");
  process.exit(1);
}

const port = parseInt(process.env.PORT ?? "3000", 10);

const provider = new WebshareProvider(apiKey);
const manager = new ProxyManager([provider]);
const router = new DomainRouter();
const client = new ProxyHTTPClient(manager, router);
const handler = createHandler(client);

log.info("starting rss-proxy", { port });

await client.setup();

const server = Bun.serve({ port, fetch: handler });
log.info("server listening", { port: server.port });

const shutdown = () => {
  log.info("shutting down");
  client.destroy();
  server.stop();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
