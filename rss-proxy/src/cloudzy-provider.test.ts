import { describe, test, expect, mock, beforeEach } from "bun:test";
import { CloudzyProvider } from "./cloudzy-provider";

const mockServers = {
  servers: [
    { address: "45.1.2.3", port: 8080, countryCode: "US" },
    { address: "89.4.5.6", port: 8080, countryCode: "DE" },
  ],
};

describe("CloudzyProvider", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  test("loads proxies from api", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(Response.json(mockServers))
    ) as typeof fetch;

    const provider = new CloudzyProvider("http://localhost:8081", "my-pass");
    const proxies = await provider.loadProxies();

    expect(proxies).toEqual([
      { username: "", password: "my-pass", address: "45.1.2.3", port: 8080, countryCode: "US", valid: true },
      { username: "", password: "my-pass", address: "89.4.5.6", port: 8080, countryCode: "DE", valid: true },
    ]);

    globalThis.fetch = originalFetch;
  });

  test("returns stale list on error after successful load", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(Response.json(mockServers))
    ) as typeof fetch;

    const provider = new CloudzyProvider("http://localhost:8081", "my-pass");
    await provider.loadProxies();

    globalThis.fetch = mock(() =>
      Promise.reject(new Error("network error"))
    ) as typeof fetch;

    const proxies = await provider.loadProxies();
    expect(proxies).toHaveLength(2);

    globalThis.fetch = originalFetch;
  });

  test("throws on error with no stale list", async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error("network error"))
    ) as typeof fetch;

    const provider = new CloudzyProvider("http://localhost:8081", "my-pass");
    expect(provider.loadProxies()).rejects.toThrow("network error");

    globalThis.fetch = originalFetch;
  });

  test("throws on non-ok response with no stale list", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("forbidden", { status: 403 }))
    ) as typeof fetch;

    const provider = new CloudzyProvider("http://localhost:8081", "my-pass");
    expect(provider.loadProxies()).rejects.toThrow("cloudzy api returned 403");

    globalThis.fetch = originalFetch;
  });
});
