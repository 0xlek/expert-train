import { WebshareProvider } from "./webshare-provider";
import { ProxyManager } from "./proxy-manager";
import { DomainRouter } from "./domain-router";
import { NextDnsResolver } from "./nextdns-resolver";
import { CachedDnsResolver } from "./cached-dns-resolver";
import { ProxyHTTPClient } from "./proxy-http-client";
import { createHandler } from "./server";
import { createLogger } from "./logger";

const log = createLogger("main");

const transparent = process.env.TRANSPARENT_PROXY === "true";
const port = parseInt(process.env.PORT ?? "3000", 10);

let client: ProxyHTTPClient;

if (transparent) {
  log.info("transparent proxy mode enabled, skipping proxy infrastructure");
  client = new ProxyHTTPClient(null, null, true);
} else {
  const apiKey = process.env.WEBSHARE_API_KEY;
  if (!apiKey) {
    log.error("WEBSHARE_API_KEY is required");
    process.exit(1);
  }

  const provider = new WebshareProvider(apiKey);
  const manager = new ProxyManager([provider]);
  const resolver = new CachedDnsResolver(new NextDnsResolver("https://dns.nextdns.io/d317db"));
  const router = new DomainRouter(resolver);
  client = new ProxyHTTPClient(manager, router);
}

const handler = createHandler(client);

log.info("starting rss-proxy", { port, transparent });

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
