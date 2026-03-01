import { describe, test, expect } from "bun:test";
import { CachedDnsResolver, type TtlDnsResolver, type DnsResult } from "./cached-dns-resolver";

function mockInner(fn: (domain: string) => DnsResult): TtlDnsResolver {
  return { resolve4WithTtl: async (domain) => fn(domain) };
}

describe("CachedDnsResolver", () => {
  test("returns addresses from inner resolver", async () => {
    const resolver = new CachedDnsResolver(
      mockInner(() => ({ addresses: ["1.2.3.4"], ttl: 60 })),
    );

    const result = await resolver.resolve4("example.com");
    expect(result).toEqual(["1.2.3.4"]);
  });

  test("serves from cache on second call within TTL", async () => {
    let calls = 0;
    const resolver = new CachedDnsResolver(
      mockInner(() => {
        calls++;
        return { addresses: ["1.2.3.4"], ttl: 60 };
      }),
    );

    await resolver.resolve4("example.com");
    await resolver.resolve4("example.com");
    expect(calls).toBe(1);
  });

  test("re-fetches after TTL expires", async () => {
    let calls = 0;
    const now = Date.now;
    let time = 1000000;
    Date.now = () => time;

    try {
      const resolver = new CachedDnsResolver(
        mockInner(() => {
          calls++;
          return { addresses: ["1.2.3.4"], ttl: 10 };
        }),
      );

      await resolver.resolve4("example.com");
      expect(calls).toBe(1);

      time += 11_000;
      await resolver.resolve4("example.com");
      expect(calls).toBe(2);
    } finally {
      Date.now = now;
    }
  });

  test("does not cache empty addresses", async () => {
    let calls = 0;
    const resolver = new CachedDnsResolver(
      mockInner(() => {
        calls++;
        return { addresses: [], ttl: 60 };
      }),
    );

    await resolver.resolve4("nxdomain.com");
    await resolver.resolve4("nxdomain.com");
    expect(calls).toBe(2);
  });

  test("does not cache zero TTL", async () => {
    let calls = 0;
    const resolver = new CachedDnsResolver(
      mockInner(() => {
        calls++;
        return { addresses: ["1.2.3.4"], ttl: 0 };
      }),
    );

    await resolver.resolve4("example.com");
    await resolver.resolve4("example.com");
    expect(calls).toBe(2);
  });

  test("caches per domain independently", async () => {
    let calls = 0;
    const resolver = new CachedDnsResolver(
      mockInner((domain) => {
        calls++;
        return { addresses: [domain === "a.com" ? "1.1.1.1" : "2.2.2.2"], ttl: 60 };
      }),
    );

    const a = await resolver.resolve4("a.com");
    const b = await resolver.resolve4("b.com");
    const a2 = await resolver.resolve4("a.com");

    expect(a).toEqual(["1.1.1.1"]);
    expect(b).toEqual(["2.2.2.2"]);
    expect(a2).toEqual(["1.1.1.1"]);
    expect(calls).toBe(2);
  });
});
