import type { Socket, TCPSocketListener } from "bun";
import type { ProxyConfig, ClientSocketData, ConnectRequest, TargetSocketData } from "./types";
import { authenticate } from "./auth";
import { createLogger } from "./logger";

const log = createLogger("server");
const MAX_HANDSHAKE_BUFFER = 8 * 1024;

export function parseConnectRequest(raw: string): ConnectRequest | null {
  const lines = raw.split("\r\n");
  const requestLine = lines[0];
  if (!requestLine) return null;

  const parts = requestLine.split(" ");
  if (parts.length < 3) return null;

  const method = parts[0];
  const target = parts[1];
  const httpVersion = parts[2];

  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) break;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();
    headers[key] = value;
  }

  // Parse host:port for CONNECT, but still return non-CONNECT requests
  // so the caller can distinguish 405 vs 400
  let host: string;
  let port: number;

  if (method !== "CONNECT") {
    return { method, host: "", port: 0, httpVersion, headers };
  }

  if (target.includes(":")) {
    const lastColon = target.lastIndexOf(":");
    host = target.slice(0, lastColon);
    port = parseInt(target.slice(lastColon + 1), 10);
    if (isNaN(port) || port <= 0 || port > 65535) return null;
  } else {
    host = target;
    port = 443;
  }

  return { method, host, port, httpVersion, headers };
}

function sendResponse(socket: Socket<ClientSocketData>, statusCode: number, reason: string, close = true) {
  const response = `HTTP/1.1 ${statusCode} ${reason}\r\n\r\n`;
  socket.write(response);
  if (close) socket.end();
}

function generateRequestId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function createServer(config: ProxyConfig): TCPSocketListener<ClientSocketData> {
  const server = Bun.listen<ClientSocketData>({
    hostname: "0.0.0.0",
    port: config.port,
    tls: {
      cert: config.tls.cert,
      key: config.tls.key,
    },
    socket: {
      open(socket) {
        // With TLS, data may fire before open — init here only if not already set
        if (!socket.data) {
          socket.data = {
            state: "handshake",
            requestId: generateRequestId(),
            buffer: Buffer.alloc(0),
            targetSocket: null,
            connectRequest: null,
          };
        }
        log.debug("client connected", { requestId: socket.data.requestId });
      },

      data(socket, data) {
        // With TLS, data can fire before open — ensure socket.data is initialized
        if (!socket.data) {
          socket.data = {
            state: "handshake",
            requestId: generateRequestId(),
            buffer: Buffer.alloc(0),
            targetSocket: null,
            connectRequest: null,
          };
        }
        const socketData = socket.data;

        if (socketData.state === "tunneling") {
          if (socketData.targetSocket) {
            socketData.targetSocket.write(data);
          }
          return;
        }

        if (socketData.state !== "handshake") return;

        // Buffer incoming data
        socketData.buffer = Buffer.concat([socketData.buffer, Buffer.from(data)]);

        if (socketData.buffer.length > MAX_HANDSHAKE_BUFFER) {
          log.warn("handshake buffer exceeded", { requestId: socketData.requestId });
          sendResponse(socket, 400, "Bad Request");
          return;
        }

        // Check for end of HTTP headers
        const headerStr = socketData.buffer.toString("utf-8");
        if (!headerStr.includes("\r\n\r\n")) return;

        const request = parseConnectRequest(headerStr);
        if (!request) {
          log.warn("malformed request", { requestId: socketData.requestId });
          sendResponse(socket, 400, "Bad Request");
          return;
        }

        if (request.method !== "CONNECT") {
          log.warn("non-CONNECT method rejected", { requestId: socketData.requestId, method: request.method });
          sendResponse(socket, 405, "Method Not Allowed");
          return;
        }

        if (!authenticate(request.headers, config.passphrase)) {
          log.warn("auth failed", { requestId: socketData.requestId, host: request.host });
          sendResponse(socket, 407, "Proxy Authentication Required");
          return;
        }

        socketData.connectRequest = request;
        log.info("connecting to target", { requestId: socketData.requestId, host: request.host, port: request.port });

        // Connect to target
        Bun.connect<TargetSocketData>({
          hostname: request.host,
          port: request.port,
          socket: {
            open(targetSocket) {
              targetSocket.data = {
                clientSocket: socket,
                requestId: socketData.requestId,
              };
              socketData.targetSocket = targetSocket;
              socketData.state = "tunneling";
              socketData.buffer = Buffer.alloc(0); // free buffer

              sendResponse(socket, 200, "Connection Established", false);
              log.info("tunnel established", { requestId: socketData.requestId, host: request.host, port: request.port });
            },

            data(targetSocket, data) {
              targetSocket.data.clientSocket.write(data);
            },

            close(targetSocket) {
              log.debug("target closed", { requestId: targetSocket.data.requestId });
              const client = targetSocket.data.clientSocket;
              if (client.data.state !== "closed") {
                client.data.state = "closed";
                client.end();
              }
            },

            error(targetSocket, err) {
              log.error("target error", { requestId: targetSocket.data.requestId, error: err.message });
              const client = targetSocket.data.clientSocket;
              if (client.data.state === "handshake") {
                sendResponse(client, 502, "Bad Gateway");
              } else if (client.data.state !== "closed") {
                client.data.state = "closed";
                client.end();
              }
            },

            connectError(targetSocket, err) {
              log.error("target connect failed", { requestId: socketData.requestId, error: err.message });
              sendResponse(socket, 502, "Bad Gateway");
            },
          },
        }).catch((err) => {
          log.error("connect error", { requestId: socketData.requestId, error: err.message });
          sendResponse(socket, 502, "Bad Gateway");
        });
      },

      close(socket) {
        const socketData = socket.data;
        if (!socketData) return;
        log.debug("client closed", { requestId: socketData.requestId });
        socketData.state = "closed";
        if (socketData.targetSocket) {
          socketData.targetSocket.end();
          socketData.targetSocket = null;
        }
      },

      error(socket, err) {
        const socketData = socket.data;
        if (!socketData) return;
        log.error("client error", { requestId: socketData.requestId, error: err.message });
        socketData.state = "closed";
        if (socketData.targetSocket) {
          socketData.targetSocket.end();
          socketData.targetSocket = null;
        }
      },
    },
  });

  log.info("proxy server started", { port: config.port });
  return server;
}
