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
  private proxyManager: ProxyManager | null;
  private domainRouter: DomainRouter | null;
  private transparent: boolean;
  private rateLimitedDomains = new Map<string, number>();

  constructor(proxyManager: ProxyManager | null, domainRouter: DomainRouter | null, transparent = false) {
    this.proxyManager = proxyManager;
    this.domainRouter = domainRouter;
    this.transparent = transparent;
  }

  async setup(): Promise<void> {
    if (this.transparent || !this.proxyManager) return;
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

    if (this.transparent) {
      log.info("transparent request", { url, method, domain });
      const res = await fetch(url, { method, headers });
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

    if (!this.domainRouter || !this.proxyManager) {
      throw new Error("proxy infrastructure not available");
    }

    const region = await this.domainRouter.resolve(domain);
    const proxyUrl = region ? this.proxyManager.proxyFor(region, "US") : this.proxyManager.proxyFor("US");

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const useDirect = !proxyUrl || attempt === 3;
        let res: Response;

        if (useDirect) {
          if (attempt === 3 && proxyUrl) {
            log.warn("retrying with direct request, skipping broken proxy", { url, domain, attempt });
          } else if (!proxyUrl) {
            log.error("no proxy available, falling back to direct request", { url, domain });
          }
          res = await fetch(url, { method, headers });
        } else {
          log.info("proxied request", { url, method, domain, region, proxy: proxyUrl.replace(/\/\/.*@/, "//***@"), attempt });
          res = await fetch(url, { method, headers, proxy: proxyUrl } as RequestInit);
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
      } catch (err) {
        log.warn("fetch attempt failed", { url, attempt, error: String(err) });
        if (attempt === 3) throw err;
        await Bun.sleep(attempt * 500);
      }
    }

    throw new Error("unreachable");
  }

  destroy(): void {
    if (this.transparent || !this.proxyManager) return;
    this.proxyManager.destroy();
  }
}
