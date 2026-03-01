export interface Proxy {
  username: string;
  password: string;
  address: string;
  port: number;
  countryCode: string;
  valid: boolean;
}

export interface ProxyProviderConfig {
  refreshIntervalMs: number;
}

export interface ProxyProvider {
  getConfig(): ProxyProviderConfig;
  loadProxies(): Promise<Proxy[]>;
}

export interface DnsResolver {
  resolve4(domain: string): Promise<string[]>;
}
