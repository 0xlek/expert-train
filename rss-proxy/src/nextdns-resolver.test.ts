import { describe, test, expect, beforeEach, mock } from "bun:test";
import { NextDnsResolver } from "./nextdns-resolver";

const originalFetch = globalThis.fetch;
const originalDns = Bun.dns.lookup;

describe("NextDnsResolver", () => {
  let resolver: NextDnsResolver;

  beforeEach(() => {
    resolver = new NextDnsResolver("https://dns.nextdns.io/d317db");
    globalThis.fetch = originalFetch;
    Bun.dns.lookup = originalDns;
  });

  test("resolves A records with TTL", async () => {
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      expect(url).toContain("name=example.com");
      expect(url).toContain("type=A");
      expect(init.headers).toEqual({ Accept: "application/dns-json" });
      return new Response(JSON.stringify({
        Answer: [
          { name: "example.com", type: 1, TTL: 55, data: "151.101.0.81" },
          { name: "example.com", type: 1, TTL: 120, data: "151.101.64.81" },
        ],
      }));
    }) as typeof fetch;

    const result = await resolver.resolve4WithTtl("example.com");
    expect(result.addresses).toEqual(["151.101.0.81", "151.101.64.81"]);
    expect(result.ttl).toBe(55);
  });

  test("filters out non-A records", async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({
        Answer: [
          { name: "example.com", type: 5, TTL: 55, data: "cdn.example.com" },
          { name: "example.com", type: 1, TTL: 30, data: "1.2.3.4" },
        ],
      }));
    }) as typeof fetch;

    const result = await resolver.resolve4WithTtl("example.com");
    expect(result.addresses).toEqual(["1.2.3.4"]);
    expect(result.ttl).toBe(30);
  });

  test("returns empty result when no answers", async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({}));
    }) as typeof fetch;

    const result = await resolver.resolve4WithTtl("nxdomain.com");
    expect(result.addresses).toEqual([]);
    expect(result.ttl).toBe(0);
  });

  test("falls back to native dns on network error", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network error");
    }) as typeof fetch;

    Bun.dns.lookup = (async () => {
      return [{ address: "93.184.216.34" }];
    }) as typeof Bun.dns.lookup;

    const result = await resolver.resolve4WithTtl("example.com");
    expect(result.addresses).toEqual(["93.184.216.34"]);
    expect(result.ttl).toBe(300);
  });

  test("falls back to native dns on non-200 response", async () => {
    globalThis.fetch = (async () => {
      return new Response("server error", { status: 500 });
    }) as typeof fetch;

    Bun.dns.lookup = (async () => {
      return [{ address: "93.184.216.34" }];
    }) as typeof Bun.dns.lookup;

    const result = await resolver.resolve4WithTtl("example.com");
    expect(result.addresses).toEqual(["93.184.216.34"]);
    expect(result.ttl).toBe(300);
  });

  test("returns empty when both nextdns and native fallback fail", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network error");
    }) as typeof fetch;

    Bun.dns.lookup = (async () => {
      throw new Error("ENOTFOUND");
    }) as typeof Bun.dns.lookup;

    const result = await resolver.resolve4WithTtl("example.com");
    expect(result.addresses).toEqual([]);
    expect(result.ttl).toBe(0);
  });
});
