import type { Socket } from "bun";

export interface ServerEntry {
  address: string;
  port: number;
  countryCode: string;
}

export interface TlsConfig {
  cert: string;
  key: string;
}

export interface ProxyConfig {
  port: number;
  passphrase: string;
  apiPort: number;
  servers: ServerEntry[];
  tls: TlsConfig;
}

export interface ConnectRequest {
  method: string;
  host: string;
  port: number;
  httpVersion: string;
  headers: Record<string, string>;
}

export type SocketState = "handshake" | "tunneling" | "closed";

export interface ClientSocketData {
  state: SocketState;
  requestId: string;
  buffer: Buffer;
  targetSocket: Socket<TargetSocketData> | null;
  connectRequest: ConnectRequest | null;
}

export interface TargetSocketData {
  clientSocket: Socket<ClientSocketData>;
  requestId: string;
}
