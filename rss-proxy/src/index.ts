import { WebshareProvider } from "./webshare-provider";
import { CloudzyProvider } from "./cloudzy-provider";
import { ProxyManager } from "./proxy-manager";
import { DomainRouter } from "./domain-router";
import { NextDnsResolver } from "./nextdns-resolver";
import { CachedDnsResolver } from "./cached-dns-resolver";
import { ProxyHTTPClient } from "./proxy-http-client";
import { createHandler } from "./server";
import { createLogger } from "./logger";
import type { ProxyProvider } from "./types";

const log = createLogger("main");

const transparent = process.env.TRANSPARENT_PROXY === "true";
const port = parseInt(process.env.PORT ?? "3000", 10);

let client: ProxyHTTPClient;

if (transparent) {
  log.info("transparent proxy mode enabled, skipping proxy infrastructure");
  client = new ProxyHTTPClient(null, null, true);
} else {
  const providers: ProxyProvider[] = [];

  const cloudzyApiUrl = process.env.CLOUDZY_API_URL;
  const cloudzyPassphrase = process.env.CLOUDZY_PASSPHRASE;
  if (cloudzyApiUrl && cloudzyPassphrase) {
    providers.push(new CloudzyProvider(cloudzyApiUrl, cloudzyPassphrase));
    log.info("cloudzy provider configured", { apiUrl: cloudzyApiUrl });
  }

  const webshareApiKey = process.env.WEBSHARE_API_KEY;
  if (webshareApiKey) {
    providers.push(new WebshareProvider(webshareApiKey));
    log.info("webshare provider configured");
  }

  if (providers.length === 0) {
    log.error("no proxy providers configured: set CLOUDZY_API_URL+CLOUDZY_PASSPHRASE or WEBSHARE_API_KEY");
    process.exit(1);
  }

  const manager = new ProxyManager(providers);
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
