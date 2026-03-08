import { describe, test, expect, afterAll, beforeAll } from "bun:test";
import { createApiServer } from "./api";
import type { ServerEntry, TlsConfig } from "./types";
import { loadTestTls } from "./test-helpers";
import type { Server } from "bun";

const servers: ServerEntry[] = [
  { address: "45.1.2.3", port: 8080, countryCode: "US" },
  { address: "89.4.5.6", port: 8080, countryCode: "DE" },
];

let api: Server;
let testTls: TlsConfig;

beforeAll(async () => {
  testTls = await loadTestTls();
  api = createApiServer(0, servers, testTls);
});

afterAll(() => {
  api.stop(true);
});

describe("api", () => {
  test("GET /servers returns server list", async () => {
    const res = await fetch(`https://localhost:${api.port}/servers`, {
      tls: { rejectUnauthorized: false },
    } as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ servers });
  });

  test("unknown route returns 404", async () => {
    const res = await fetch(`https://localhost:${api.port}/unknown`, {
      tls: { rejectUnauthorized: false },
    } as any);
    expect(res.status).toBe(404);
  });
});
