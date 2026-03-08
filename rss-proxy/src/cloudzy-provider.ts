import type { Proxy, ProxyProvider, ProxyProviderConfig } from "./types";
import { createLogger } from "./logger";

const log = createLogger("cloudzy-provider");

interface ServerEntry {
  address: string;
  port: number;
  countryCode: string;
}

interface ServersResponse {
  servers: ServerEntry[];
}

export class CloudzyProvider implements ProxyProvider {
  private apiUrl: string;
  private passphrase: string;
  private proxies: Proxy[] = [];

  constructor(apiUrl: string, passphrase: string) {
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.passphrase = passphrase;
  }

  getConfig(): ProxyProviderConfig {
    return { refreshIntervalMs: 5 * 60 * 1000 };
  }

  async loadProxies(): Promise<Proxy[]> {
    log.info("loading proxy list from cloudzy api", { apiUrl: this.apiUrl });

    try {
      const res = await fetch(`${this.apiUrl}/servers`);

      if (!res.ok) {
        throw new Error(`cloudzy api returned ${res.status}: ${await res.text()}`);
      }

      const data: ServersResponse = await res.json();
      const all: Proxy[] = data.servers.map((s) => ({
        username: "",
        password: this.passphrase,
        address: s.address,
        port: s.port,
        countryCode: s.countryCode,
        valid: true,
        scheme: "https" as const,
      }));

      this.proxies = all;
      log.info("loaded proxies", { count: all.length });
      return all;
    } catch (err) {
      if (this.proxies.length > 0) {
        log.warn("failed to refresh proxies, using stale list", {
          staleCount: this.proxies.length,
          error: String(err),
        });
        return this.proxies;
      }
      throw err;
    }
  }
}
