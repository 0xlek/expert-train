import { createLogger } from "./logger";
import type { DnsResolver } from "./types";

const log = createLogger("domain-router");

const CACHE_TTL_MS = 60 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  region: string;
  ts: number;
}

export class DomainRouter {
  private cache = new Map<string, CacheEntry>();

  constructor(private resolver: DnsResolver) {}

  async resolve(domain: string): Promise<string | null> {
    const cached = this.cache.get(domain);
    if (cached) {
      const ttl = cached.region === "FAILED" ? NEGATIVE_CACHE_TTL_MS : CACHE_TTL_MS;
      if (Date.now() - cached.ts < ttl) {
        if (cached.region === "FAILED") return null;
        log.debug("cache hit", { domain, region: cached.region });
        return cached.region;
      }
    }

    try {
      const addresses = await this.resolver.resolve4(domain);
      if (!addresses.length) {
        log.warn("dns returned no addresses", { domain });
        this.cache.set(domain, { region: "FAILED", ts: Date.now() });
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
        this.cache.set(domain, { region: "FAILED", ts: Date.now() });
        return null;
      }

      this.cache.set(domain, { region, ts: Date.now() });
      log.info("resolved domain", { domain, ip, region });
      return region;
    } catch (err) {
      log.error("failed to resolve domain", { domain, error: String(err) });
      this.cache.set(domain, { region: "FAILED", ts: Date.now() });
      return null;
    }
  }
}
