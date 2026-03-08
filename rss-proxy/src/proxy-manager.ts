import type { Proxy, ProxyProvider } from "./types";
import { createLogger } from "./logger";

const log = createLogger("proxy-manager");

export class ProxyManager {
  private providers: ProxyProvider[];
  private proxyIndex = new Map<string, Proxy[]>();
  private rotationCounters = new Map<string, number>();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(providers: ProxyProvider[]) {
    this.providers = providers;
  }

  async init(): Promise<void> {
    await this.refresh();
    const interval = this.providers[0]?.getConfig().refreshIntervalMs ?? 5 * 60 * 1000;
    this.refreshTimer = setInterval(() => this.refresh(), interval);
    log.info("initialized", { regions: [...this.proxyIndex.keys()], refreshIntervalMs: interval });
  }

  async refresh(): Promise<void> {
    log.info("refreshing proxy list");
    const index = new Map<string, Proxy[]>();

    for (const provider of this.providers) {
      try {
        const proxies = await provider.loadProxies();
        for (const proxy of proxies) {
          const region = proxy.countryCode;
          const list = index.get(region);
          if (list) {
            list.push(proxy);
          } else {
            index.set(region, [proxy]);
          }
        }
      } catch (err) {
        log.error("provider failed during refresh, skipping", { error: String(err) });
      }
    }

    this.proxyIndex = index;
    const total = [...index.values()].reduce((sum, arr) => sum + arr.length, 0);
    log.info("proxy index rebuilt", { regions: index.size, total });
  }

  proxyFor(region: string, fallbackRegion?: string): string | null {
    let proxies = this.proxyIndex.get(region);
    let usedRegion = region;

    if ((!proxies || proxies.length === 0) && fallbackRegion) {
      log.warn("no proxies for region, trying fallback", { region, fallbackRegion });
      proxies = this.proxyIndex.get(fallbackRegion);
      usedRegion = fallbackRegion;
    }

    if (!proxies || proxies.length === 0) {
      log.error("no proxies available", { region, fallbackRegion });
      return null;
    }

    const counter = this.rotationCounters.get(usedRegion) ?? 0;
    const idx = counter % proxies.length;
    this.rotationCounters.set(usedRegion, counter + 1);

    const proxy = proxies[idx];
    log.debug("selected proxy", { region: usedRegion, index: idx, address: proxy.address, port: proxy.port });
    return `${proxy.scheme}://${proxy.username}:${proxy.password}@${proxy.address}:${proxy.port}`;
  }

  destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    log.info("destroyed");
  }
}
