import { describe, test, expect, beforeEach } from "bun:test";
import { DomainRouter } from "./domain-router";
import dns from "node:dns/promises";

const originalFetch = globalThis.fetch;
const originalResolve4 = dns.resolve4;

describe("DomainRouter", () => {
  let router: DomainRouter;

  beforeEach(() => {
    router = new DomainRouter();
    globalThis.fetch = originalFetch;
    dns.resolve4 = originalResolve4;
  });

  test("resolves domain via dns then headdoff, caches result", async () => {
    let fetchCount = 0;
    dns.resolve4 = (async () => ["151.101.0.81"]) as typeof dns.resolve4;
    globalThis.fetch = (async (url: string) => {
      fetchCount++;
      expect(url).toContain("151.101.0.81");
      return new Response(JSON.stringify({ country_code: "GB" }), { status: 200 });
    }) as typeof fetch;

    const region1 = await router.resolve("bbc.co.uk");
    const region2 = await router.resolve("bbc.co.uk");

    expect(region1).toBe("GB");
    expect(region2).toBe("GB");
    expect(fetchCount).toBe(1);
  });

  test("returns null on dns failure", async () => {
    dns.resolve4 = (async () => { throw new Error("ENOTFOUND"); }) as typeof dns.resolve4;

    const region = await router.resolve("broken.com");
    expect(region).toBeNull();
  });

  test("returns null on fetch failure", async () => {
    dns.resolve4 = (async () => ["1.2.3.4"]) as typeof dns.resolve4;
    globalThis.fetch = (async () => {
      throw new Error("network error");
    }) as typeof fetch;

    const region = await router.resolve("broken.com");
    expect(region).toBeNull();
  });

  test("returns null on non-ok response", async () => {
    dns.resolve4 = (async () => ["1.2.3.4"]) as typeof dns.resolve4;
    globalThis.fetch = (async () => {
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const region = await router.resolve("unknown.com");
    expect(region).toBeNull();
  });

  test("returns null when response has no country", async () => {
    dns.resolve4 = (async () => ["1.2.3.4"]) as typeof dns.resolve4;
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    const region = await router.resolve("weird.com");
    expect(region).toBeNull();
  });
});
