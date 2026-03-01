import { createLogger } from "./logger";
import dns from "node:dns/promises";

const log = createLogger("domain-router");

const CACHE_TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  region: string;
  ts: number;
}

export class DomainRouter {
  private cache = new Map<string, CacheEntry>();

  async resolve(domain: string): Promise<string | null> {
    const cached = this.cache.get(domain);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      log.debug("cache hit", { domain, region: cached.region });
      return cached.region;
    }

    try {
      const addresses = await dns.resolve4(domain);
      if (!addresses.length) {
        log.warn("dns returned no addresses", { domain });
        return null;
      }

      const ip = addresses[0];
      const url = `https://headdoff.sgamidinov.com/ip/${ip}`;
      log.debug("resolving ip region", { domain, ip, url });

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`headdoff returned ${res.status}`);
      }

      const data = await res.json();
      const region = data.country_code ?? data.countryCode ?? null;

      if (!region) {
        log.warn("no region in response", { domain, ip, data });
        return null;
      }

      this.cache.set(domain, { region, ts: Date.now() });
      log.info("resolved domain", { domain, ip, region });
      return region;
    } catch (err) {
      log.error("failed to resolve domain", { domain, error: String(err) });
      return null;
    }
  }
}
