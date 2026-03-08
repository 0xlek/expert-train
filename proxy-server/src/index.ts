import { createServer } from "./server";
import { createApiServer } from "./api";
import { createLogger } from "./logger";
import type { ProxyConfig, ServerEntry, TlsConfig } from "./types";

const log = createLogger("main");

const passphrase = process.env.PROXY_PASSPHRASE;
if (!passphrase) {
  log.error("PROXY_PASSPHRASE environment variable is required");
  process.exit(1);
}

const tlsCertPath = process.env.TLS_CERT ?? "/certs/cert.pem";
const tlsKeyPath = process.env.TLS_KEY ?? "/certs/key.pem";

const cert = await Bun.file(tlsCertPath).text();
const key = await Bun.file(tlsKeyPath).text();
const tls: TlsConfig = { cert, key };

log.info("loaded tls certificates", { cert: tlsCertPath, key: tlsKeyPath });

const servers: ServerEntry[] = [];
const proxyServersEnv = process.env.PROXY_SERVERS;
if (proxyServersEnv) {
  for (const entry of proxyServersEnv.split(",")) {
    const [address, portStr, countryCode] = entry.trim().split(":");
    if (!address || !portStr || !countryCode) {
      log.error("invalid PROXY_SERVERS entry, expected address:port:countryCode", { entry });
      process.exit(1);
    }
    servers.push({ address, port: parseInt(portStr, 10), countryCode });
  }
  log.info("parsed proxy servers", { count: servers.length });
}

const apiPort = parseInt(process.env.API_PORT ?? "8081", 10);

const config: ProxyConfig = {
  port: parseInt(process.env.PORT ?? "8080", 10),
  passphrase,
  apiPort,
  servers,
  tls,
};

const server = createServer(config);
const apiServer = createApiServer(apiPort, servers, tls);

function shutdown() {
  log.info("shutting down");
  apiServer.stop(true);
  server.stop(true);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
