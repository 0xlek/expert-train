import type { Server } from "bun";
import type { ServerEntry, TlsConfig } from "./types";
import { createLogger } from "./logger";

const log = createLogger("api");

export function createApiServer(port: number, servers: ServerEntry[], tls: TlsConfig): Server {
  const server = Bun.serve({
    port,
    tls: {
      cert: tls.cert,
      key: tls.key,
    },
    fetch(req) {
      const url = new URL(req.url);

      if (req.method === "GET" && url.pathname === "/servers") {
        log.debug("serving server list", { count: servers.length });
        return Response.json({ servers });
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  log.info("api server listening", { port: server.port, tls: true });
  return server;
}
