import { describe, test, expect } from "bun:test";
import { ProxyManager } from "./proxy-manager";
import type { Proxy, ProxyProvider } from "./types";

function makeProxy(countryCode: string, username: string): Proxy {
  return { username, password: "pass", address: "p.webshare.io", port: 80, countryCode, valid: true };
}

function mockProvider(proxies: Proxy[]): ProxyProvider {
  return {
    getConfig: () => ({ refreshIntervalMs: 60_000 }),
    loadProxies: async () => proxies,
  };
}

describe("ProxyManager", () => {
  test("indexes proxies by region", async () => {
    const provider = mockProvider([makeProxy("US", "user-us-1"), makeProxy("GB", "user-gb-1"), makeProxy("US", "user-us-2")]);
    const manager = new ProxyManager([provider]);
    await manager.init();

    const url = manager.proxyFor("US");
    expect(url).toContain("user-us-1");
    expect(url).toContain("p.webshare.io");

    manager.destroy();
  });

  test("round-robin rotates through proxies", async () => {
    const provider = mockProvider([makeProxy("US", "user-us-1"), makeProxy("US", "user-us-2")]);
    const manager = new ProxyManager([provider]);
    await manager.init();

    const first = manager.proxyFor("US");
    const second = manager.proxyFor("US");
    const third = manager.proxyFor("US");

    expect(first).toContain("user-us-1");
    expect(second).toContain("user-us-2");
    expect(third).toContain("user-us-1");

    manager.destroy();
  });

  test("falls back to fallback region", async () => {
    const provider = mockProvider([makeProxy("US", "user-us-1")]);
    const manager = new ProxyManager([provider]);
    await manager.init();

    const url = manager.proxyFor("GB", "US");
    expect(url).toContain("user-us-1");

    manager.destroy();
  });

  test("returns null when no proxies available", async () => {
    const provider = mockProvider([]);
    const manager = new ProxyManager([provider]);
    await manager.init();

    const url = manager.proxyFor("US");
    expect(url).toBeNull();

    manager.destroy();
  });

  test("returns backbone proxy url with credentials", async () => {
    const proxy: Proxy = { username: "user-de-1", password: "mypass", address: "p.webshare.io", port: 80, countryCode: "DE", valid: true };
    const provider = mockProvider([proxy]);
    const manager = new ProxyManager([provider]);
    await manager.init();

    const url = manager.proxyFor("DE");
    expect(url).toBe("http://user-de-1:mypass@p.webshare.io:80");

    manager.destroy();
  });
});
