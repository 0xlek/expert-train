import { describe, test, expect } from "bun:test";
import { createHandler } from "./server";
import type { ProxyHTTPClient } from "./proxy-http-client";

function mockClient(response?: Response): ProxyHTTPClient {
  return {
    request: async () => response ?? new Response("<rss></rss>", { status: 200, headers: { "Content-Type": "application/xml" } }),
    setup: async () => {},
    destroy: () => {},
  } as unknown as ProxyHTTPClient;
}

function makeUrl(target: string, kind = "rss-feed"): string {
  const encoded = btoa(target);
  return `http://localhost:3000/?url=${encoded}&kind=${kind}`;
}

describe("server handler", () => {
  test("proxies valid rss-feed request", async () => {
    const handler = createHandler(mockClient());
    const res = await handler(new Request(makeUrl("https://feeds.bbci.co.uk/news/rss.xml")));

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Request-ID")).toBeTruthy();
    const body = await res.text();
    expect(body).toContain("<rss");
  });

  test("rejects non-GET methods", async () => {
    const handler = createHandler(mockClient());
    const res = await handler(new Request("http://localhost:3000/", { method: "POST" }));
    expect(res.status).toBe(405);
  });

  test("rejects missing kind", async () => {
    const handler = createHandler(mockClient());
    const encoded = btoa("https://example.com/feed.xml");
    const res = await handler(new Request(`http://localhost:3000/?url=${encoded}`));
    expect(res.status).toBe(400);
  });

  test("rejects invalid kind", async () => {
    const handler = createHandler(mockClient());
    const res = await handler(new Request(makeUrl("https://example.com/feed.xml", "json-api")));
    expect(res.status).toBe(400);
  });

  test("rejects missing url param", async () => {
    const handler = createHandler(mockClient());
    const res = await handler(new Request("http://localhost:3000/?kind=rss-feed"));
    expect(res.status).toBe(400);
  });

  test("rejects invalid base64", async () => {
    const handler = createHandler(mockClient());
    const res = await handler(new Request("http://localhost:3000/?url=not-valid-base64!!!&kind=rss-feed"));
    expect(res.status).toBe(400);
  });

  test("supports HEAD requests", async () => {
    const handler = createHandler(mockClient());
    const res = await handler(new Request(makeUrl("https://example.com/feed.xml"), { method: "HEAD" }));
    expect(res.status).toBe(200);
  });

  test("strips hop-by-hop headers from response", async () => {
    const upstream = new Response("ok", {
      headers: { "Content-Type": "text/xml", "Connection": "keep-alive", "Transfer-Encoding": "chunked" },
    });
    const handler = createHandler(mockClient(upstream));
    const res = await handler(new Request(makeUrl("https://example.com/feed.xml")));

    expect(res.headers.get("Content-Type")).toBe("text/xml");
    expect(res.headers.get("Connection")).toBeNull();
    expect(res.headers.get("Transfer-Encoding")).toBeNull();
  });

  test("sends Chrome browser headers, not incoming request headers", async () => {
    let capturedHeaders: Headers | undefined;
    const spyClient = {
      request: async (opts: { headers: Headers }) => {
        capturedHeaders = opts.headers;
        return new Response("<rss></rss>", { status: 200, headers: { "Content-Type": "application/xml" } });
      },
      setup: async () => {},
      destroy: () => {},
    } as unknown as ProxyHTTPClient;

    const handler = createHandler(spyClient);
    const res = await handler(new Request(makeUrl("https://example.com/feed.xml"), {
      headers: { "User-Agent": "curl/7.88", "X-Custom": "leak-test" },
    }));

    expect(res.status).toBe(200);
    expect(capturedHeaders).toBeDefined();
    expect(capturedHeaders!.get("User-Agent")).toContain("Chrome/131");
    expect(capturedHeaders!.get("Sec-Ch-Ua")).toContain("Google Chrome");
    expect(capturedHeaders!.get("Accept-Language")).toBe("en-US,en;q=0.9");
    expect(capturedHeaders!.get("X-Custom")).toBeNull();
    expect(capturedHeaders!.get("Host")).toBeNull();
  });

  test("returns 502 on unhandled error", async () => {
    const failClient = {
      request: async () => { throw new Error("boom"); },
      setup: async () => {},
      destroy: () => {},
    } as unknown as ProxyHTTPClient;

    const handler = createHandler(failClient);
    const res = await handler(new Request(makeUrl("https://example.com/feed.xml")));
    expect(res.status).toBe(502);
  });
});
