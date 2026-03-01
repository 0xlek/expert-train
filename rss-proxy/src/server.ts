import type { ProxyHTTPClient } from "./proxy-http-client";
import { createLogger } from "./logger";

const log = createLogger("server");

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

function stripHopByHop(headers: Headers): Headers {
  const clean = new Headers();
  headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      clean.set(key, value);
    }
  });
  return clean;
}

export function createHandler(client: ProxyHTTPClient) {
  return async (req: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const url = new URL(req.url);

    log.info("incoming request", { requestId, method: req.method, path: url.pathname, search: url.search });

    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        log.warn("method not allowed", { requestId, method: req.method });
        return new Response("Method Not Allowed", { status: 405, headers: { "X-Request-ID": requestId } });
      }

      const encodedUrl = url.searchParams.get("url");
      const kind = url.searchParams.get("kind");

      if (kind !== "rss-feed") {
        log.warn("invalid kind", { requestId, kind });
        return new Response("Bad Request: kind must be rss-feed", {
          status: 400,
          headers: { "X-Request-ID": requestId },
        });
      }

      if (!encodedUrl) {
        log.warn("missing url param", { requestId });
        return new Response("Bad Request: missing url parameter", {
          status: 400,
          headers: { "X-Request-ID": requestId },
        });
      }

      let targetUrl: string;
      try {
        targetUrl = atob(encodedUrl);
        new URL(targetUrl);
      } catch {
        log.warn("invalid base64 or url", { requestId, encodedUrl });
        return new Response("Bad Request: invalid base64 url", {
          status: 400,
          headers: { "X-Request-ID": requestId },
        });
      }

      const forwardHeaders = new Headers({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Sec-Ch-Ua": "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": "\"Windows\"",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      });

      log.info("proxying request", { requestId, targetUrl });

      const upstream = await client.request({
        url: targetUrl,
        method: req.method,
        headers: forwardHeaders,
      });

      const responseHeaders = stripHopByHop(new Headers(upstream.headers));
      responseHeaders.set("X-Request-ID", requestId);

      log.info("request completed", { requestId, status: upstream.status });

      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch (err) {
      log.error("unhandled error", { requestId, error: String(err) });
      return new Response("Bad Gateway", { status: 502, headers: { "X-Request-ID": requestId } });
    }
  };
}
