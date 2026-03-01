import type { ProxyManager } from "./proxy-manager";
import type { DomainRouter } from "./domain-router";
import { createLogger } from "./logger";

const log = createLogger("proxy-http-client");

const RATE_LIMIT_TTL_MS = 10 * 60 * 1000;
const EMPTY_RSS = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel></channel></rss>`;

interface RequestOptions {
  url: string;
  method: string;
  headers: Headers;
}

export class ProxyHTTPClient {
  private proxyManager: ProxyManager;
  private domainRouter: DomainRouter;
  private rateLimitedDomains = new Map<string, number>();

  constructor(proxyManager: ProxyManager, domainRouter: DomainRouter) {
    this.proxyManager = proxyManager;
    this.domainRouter = domainRouter;
  }

  async setup(): Promise<void> {
    await this.proxyManager.init();
  }

  async request(opts: RequestOptions): Promise<Response> {
    const { url, method, headers } = opts;
    const domain = new URL(url).hostname;

    const rateLimitedUntil = this.rateLimitedDomains.get(domain);
    if (rateLimitedUntil && Date.now() < rateLimitedUntil) {
      log.warn("domain is rate-limited, returning empty rss", { domain });
      return new Response(EMPTY_RSS, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }

    if (rateLimitedUntil && Date.now() >= rateLimitedUntil) {
      this.rateLimitedDomains.delete(domain);
    }

    const region = await this.domainRouter.resolve(domain);
    const proxyUrl = region ? this.proxyManager.proxyFor(region, "US") : this.proxyManager.proxyFor("US");

    let res: Response;

    if (proxyUrl) {
      log.info("proxied request", { url, method, domain, region, proxy: proxyUrl.replace(/\/\/.*@/, "//***@") });
      res = await fetch(url, { method, headers, proxy: proxyUrl } as RequestInit);
    } else {
      log.error("no proxy available, falling back to direct request", { url, domain });
      res = await fetch(url, { method, headers });
    }

    if (res.status === 429) {
      log.warn("429 received, marking domain rate-limited", { domain });
      this.rateLimitedDomains.set(domain, Date.now() + RATE_LIMIT_TTL_MS);
      return new Response(EMPTY_RSS, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }

    return res;
  }

  destroy(): void {
    this.proxyManager.destroy();
  }
}
