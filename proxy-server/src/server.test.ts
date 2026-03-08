import { describe, test, expect, beforeAll } from "bun:test";
import { parseConnectRequest, createServer } from "./server";
import tls from "node:tls";
import net from "node:net";
import type { TlsConfig } from "./types";
import { loadTestTls } from "./test-helpers";

let testTls: TlsConfig;

beforeAll(async () => {
  testTls = await loadTestTls();
});

function makeConfig(passphrase: string) {
  return { port: 0, passphrase, apiPort: 0, servers: [], tls: testTls };
}

describe("parseConnectRequest", () => {
  test("parses valid CONNECT request", () => {
    const raw = "CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\nProxy-Authorization: Basic dGVzdA==\r\n\r\n";
    const req = parseConnectRequest(raw);
    expect(req).not.toBeNull();
    expect(req!.method).toBe("CONNECT");
    expect(req!.host).toBe("example.com");
    expect(req!.port).toBe(443);
    expect(req!.headers["host"]).toBe("example.com:443");
  });

  test("parses host without port (defaults to 443)", () => {
    const raw = "CONNECT example.com HTTP/1.1\r\n\r\n";
    const req = parseConnectRequest(raw);
    expect(req).not.toBeNull();
    expect(req!.host).toBe("example.com");
    expect(req!.port).toBe(443);
  });

  test("parses custom port", () => {
    const raw = "CONNECT example.com:8443 HTTP/1.1\r\n\r\n";
    const req = parseConnectRequest(raw);
    expect(req).not.toBeNull();
    expect(req!.port).toBe(8443);
  });

  test("returns null for empty input", () => {
    expect(parseConnectRequest("")).toBeNull();
  });

  test("returns null for malformed request line", () => {
    expect(parseConnectRequest("BADREQUEST\r\n\r\n")).toBeNull();
  });

  test("returns null for invalid port", () => {
    expect(parseConnectRequest("CONNECT example.com:99999 HTTP/1.1\r\n\r\n")).toBeNull();
  });
});

describe("proxy server integration", () => {
  test("rejects non-CONNECT method with 405", async () => {
    const server = createServer(makeConfig("test-pass"));
    const port = server.port;

    try {
      const response = await rawTlsRequest(port, "GET http://example.com/ HTTP/1.1\r\nHost: example.com\r\n\r\n");
      expect(response).toContain("405");
    } finally {
      server.stop(true);
    }
  });

  test("rejects missing auth with 407", async () => {
    const server = createServer(makeConfig("test-pass"));
    const port = server.port;

    try {
      const response = await rawTlsRequest(port, "CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n");
      expect(response).toContain("407");
    } finally {
      server.stop(true);
    }
  });

  test("rejects wrong passphrase with 407", async () => {
    const server = createServer(makeConfig("test-pass"));
    const port = server.port;

    try {
      const auth = `Basic ${btoa(":wrong-pass")}`;
      const response = await rawTlsRequest(port, `CONNECT example.com:443 HTTP/1.1\r\nProxy-Authorization: ${auth}\r\n\r\n`);
      expect(response).toContain("407");
    } finally {
      server.stop(true);
    }
  });

  test("establishes tunnel with valid auth", async () => {
    const echoServer = net.createServer((socket) => {
      socket.on("data", (data) => socket.write(data));
    });
    await new Promise<void>((resolve) => echoServer.listen(0, resolve));
    const targetPort = (echoServer.address() as net.AddressInfo).port;

    const server = createServer(makeConfig("test-pass"));
    const proxyPort = server.port;

    try {
      const auth = `Basic ${btoa(":test-pass")}`;
      const { socket, firstResponse } = await rawTlsConnect(
        proxyPort,
        `CONNECT 127.0.0.1:${targetPort} HTTP/1.1\r\nProxy-Authorization: ${auth}\r\n\r\n`
      );

      expect(firstResponse).toContain("200");

      socket.write("hello tunnel");
      const echoed = await readFromSocket(socket);
      expect(echoed).toBe("hello tunnel");

      socket.end();
    } finally {
      server.stop(true);
      echoServer.close();
    }
  });
});

function rawTlsRequest(port: number, data: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ port, host: "127.0.0.1", rejectUnauthorized: false }, () => {
      socket.write(data);
    });
    let response = "";
    socket.on("data", (chunk) => { response += chunk.toString(); });
    socket.on("end", () => resolve(response));
    socket.on("error", reject);
    setTimeout(() => { socket.destroy(); resolve(response); }, 2000);
  });
}

function rawTlsConnect(port: number, data: string): Promise<{ socket: tls.TLSSocket; firstResponse: string }> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ port, host: "127.0.0.1", rejectUnauthorized: false }, () => {
      socket.write(data);
    });
    socket.once("data", (chunk) => {
      resolve({ socket, firstResponse: chunk.toString() });
    });
    socket.on("error", reject);
    setTimeout(() => reject(new Error("timeout")), 5000);
  });
}

function readFromSocket(socket: tls.TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    socket.once("data", (chunk) => resolve(chunk.toString()));
    socket.on("error", reject);
    setTimeout(() => reject(new Error("read timeout")), 3000);
  });
}
