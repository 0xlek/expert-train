import type { TlsConfig } from "./types";
import { resolve } from "node:path";

const certDir = resolve(import.meta.dir, "../.certs");

let cached: TlsConfig | null = null;

export async function loadTestTls(): Promise<TlsConfig> {
  if (cached) return cached;
  cached = {
    cert: await Bun.file(`${certDir}/cert.pem`).text(),
    key: await Bun.file(`${certDir}/key.pem`).text(),
  };
  return cached;
}
