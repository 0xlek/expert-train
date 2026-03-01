type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getThreshold(): number {
  const env = (process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
  return LEVELS[env] ?? LEVELS.info;
}

function write(level: LogLevel, component: string, msg: string, ctx?: Record<string, unknown>) {
  if (LEVELS[level] < getThreshold()) return;
  const entry: Record<string, unknown> = { ts: new Date().toISOString(), level, component, msg };
  if (ctx) Object.assign(entry, ctx);
  process.stdout.write(JSON.stringify(entry) + "\n");
}

export function createLogger(component: string) {
  return {
    debug: (msg: string, ctx?: Record<string, unknown>) => write("debug", component, msg, ctx),
    info: (msg: string, ctx?: Record<string, unknown>) => write("info", component, msg, ctx),
    warn: (msg: string, ctx?: Record<string, unknown>) => write("warn", component, msg, ctx),
    error: (msg: string, ctx?: Record<string, unknown>) => write("error", component, msg, ctx),
  };
}
