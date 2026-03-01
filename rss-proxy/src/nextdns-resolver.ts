import type { TtlDnsResolver, DnsResult } from "./cached-dns-resolver";
import { createLogger } from "./logger";

const log = createLogger("nextdns");

interface DnsAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

interface DnsResponse {
  Answer?: DnsAnswer[];
}

export class NextDnsResolver implements TtlDnsResolver {
  constructor(private baseUrl: string) {}

  async resolve4WithTtl(domain: string): Promise<DnsResult> {
    try {
      const url = `${this.baseUrl}?name=${encodeURIComponent(domain)}&type=A`;
      const res = await fetch(url, {
        headers: { Accept: "application/dns-json" },
      });

      if (!res.ok) {
        log.warn("non-ok response", { domain, status: res.status });
        return { addresses: [], ttl: 0 };
      }

      const data: DnsResponse = await res.json();
      const aRecords = (data.Answer ?? []).filter((a) => a.type === 1);
      const addresses = aRecords.map((a) => a.data);
      const ttl = aRecords.length > 0 ? Math.min(...aRecords.map((a) => a.TTL)) : 0;

      log.debug("resolved", { domain, addresses, ttl });
      return { addresses, ttl };
    } catch (err) {
      log.error("dns resolution failed", { domain, error: String(err) });
      return { addresses: [], ttl: 0 };
    }
  }
}
