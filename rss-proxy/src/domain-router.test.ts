import { describe, test, expect, beforeEach } from "bun:test";
import { DomainRouter } from "./domain-router";
import type { DnsResolver } from "./types";

const originalFetch = globalThis.fetch;

function mockResolver(fn: (domain: string) => Promise<string[]>): DnsResolver {
  return { resolve4: fn };
}

describe("DomainRouter", () => {
  let router: DomainRouter;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("resolves domain via dns then headdoff, caches result", async () => {
    let fetchCount = 0;
    const resolver = mockResolver(async () => ["151.101.0.81"]);
    router = new DomainRouter(resolver);

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
    const resolver = mockResolver(async () => { throw new Error("ENOTFOUND"); });
    router = new DomainRouter(resolver);

    const region = await router.resolve("broken.com");
    expect(region).toBeNull();
  });

  test("returns null on fetch failure", async () => {
    const resolver = mockResolver(async () => ["1.2.3.4"]);
    router = new DomainRouter(resolver);

    globalThis.fetch = (async () => {
      throw new Error("network error");
    }) as typeof fetch;

    const region = await router.resolve("broken.com");
    expect(region).toBeNull();
  });

  test("returns null on non-ok response", async () => {
    const resolver = mockResolver(async () => ["1.2.3.4"]);
    router = new DomainRouter(resolver);

    globalThis.fetch = (async () => {
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const region = await router.resolve("unknown.com");
    expect(region).toBeNull();
  });

  test("returns null when response has no country", async () => {
    const resolver = mockResolver(async () => ["1.2.3.4"]);
    router = new DomainRouter(resolver);

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    const region = await router.resolve("weird.com");
    expect(region).toBeNull();
  });

  test("negative caches dns failure, avoids repeated lookups", async () => {
    let resolveCount = 0;
    const resolver = mockResolver(async () => {
      resolveCount++;
      throw new Error("ENOTFOUND");
    });
    router = new DomainRouter(resolver);

    await router.resolve("broken.com");
    await router.resolve("broken.com");
    await router.resolve("broken.com");

    expect(resolveCount).toBe(1);
  });

  test("negative caches fetch failure", async () => {
    let fetchCount = 0;
    const resolver = mockResolver(async () => ["1.2.3.4"]);
    router = new DomainRouter(resolver);

    globalThis.fetch = (async () => {
      fetchCount++;
      throw new Error("network error");
    }) as typeof fetch;

    await router.resolve("fail.com");
    await router.resolve("fail.com");

    expect(fetchCount).toBe(1);
  });

  test("negative caches empty dns result", async () => {
    let resolveCount = 0;
    const resolver = mockResolver(async () => {
      resolveCount++;
      return [];
    });
    router = new DomainRouter(resolver);

    await router.resolve("empty.com");
    await router.resolve("empty.com");

    expect(resolveCount).toBe(1);
  });

  test("negative caches missing region response", async () => {
    let fetchCount = 0;
    const resolver = mockResolver(async () => ["1.2.3.4"]);
    router = new DomainRouter(resolver);

    globalThis.fetch = (async () => {
      fetchCount++;
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    await router.resolve("noregion.com");
    await router.resolve("noregion.com");

    expect(fetchCount).toBe(1);
  });
});
