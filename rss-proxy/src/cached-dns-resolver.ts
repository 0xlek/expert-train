import { createLogger } from "./logger";
import type { DnsResolver } from "./types";

const log = createLogger("dns-cache");

export interface DnsResult {
  addresses: string[];
  ttl: number;
}

export interface TtlDnsResolver {
  resolve4WithTtl(domain: string): Promise<DnsResult>;
}

interface CacheEntry {
  addresses: string[];
  expiresAt: number;
}

export class CachedDnsResolver implements DnsResolver {
  private cache = new Map<string, CacheEntry>();

  constructor(private inner: TtlDnsResolver) {}

  async resolve4(domain: string): Promise<string[]> {
    const cached = this.cache.get(domain);
    if (cached && Date.now() < cached.expiresAt) {
      log.debug("cache hit", { domain });
      return cached.addresses;
    }

    const result = await this.inner.resolve4WithTtl(domain);

    if (result.addresses.length > 0 && result.ttl > 0) {
      this.cache.set(domain, {
        addresses: result.addresses,
        expiresAt: Date.now() + result.ttl * 1000,
      });
      log.debug("cached", { domain, ttl: result.ttl });
    }

    return result.addresses;
  }
}
