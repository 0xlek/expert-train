import type { Proxy, ProxyProvider, ProxyProviderConfig } from "./types";
import { createLogger } from "./logger";

const log = createLogger("webshare-provider");

const BACKBONE_ADDRESS = "p.webshare.io";
const BACKBONE_PORT = 80;

interface WebshareProxyResult {
  username: string;
  password: string;
  proxy_address: string;
  port: number;
  country_code: string;
  valid: boolean;
}

interface WebshareListResponse {
  count: number;
  next: string | null;
  results: WebshareProxyResult[];
}

export class WebshareProvider implements ProxyProvider {
  private apiKey: string;
  private proxies: Proxy[] = [];

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  getConfig(): ProxyProviderConfig {
    return { refreshIntervalMs: 5 * 60 * 1000 };
  }

  async loadProxies(): Promise<Proxy[]> {
    log.info("loading proxy list from webshare (backbone mode)");
    const all: Proxy[] = [];
    let page = 1;

    try {
      while (true) {
        const url = `https://proxy.webshare.io/api/v2/proxy/list/?mode=backbone&page=${page}&page_size=100`;
        log.debug("fetching page", { page, url });

        const res = await fetch(url, {
          headers: { Authorization: `Token ${this.apiKey}` },
        });

        if (!res.ok) {
          throw new Error(`webshare api returned ${res.status}: ${await res.text()}`);
        }

        const data: WebshareListResponse = await res.json();

        for (const p of data.results) {
          if (!p.valid) continue;
          all.push({
            username: p.username,
            password: p.password,
            address: BACKBONE_ADDRESS,
            port: BACKBONE_PORT,
            countryCode: p.country_code,
            valid: p.valid,
          });
        }

        if (!data.next) break;
        page++;
      }

      this.proxies = all;
      log.info("loaded proxies", { count: all.length, address: BACKBONE_ADDRESS, port: BACKBONE_PORT });
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
