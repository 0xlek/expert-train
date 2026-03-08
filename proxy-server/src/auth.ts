export function authenticate(headers: Record<string, string>, passphrase: string): boolean {
  const authHeader = headers["proxy-authorization"];
  if (!authHeader) return false;

  const match = authHeader.match(/^Basic\s+(.+)$/i);
  if (!match) return false;

  let decoded: string;
  try {
    decoded = atob(match[1]);
  } catch {
    return false;
  }

  // Format is username:password — we only check password (after first colon)
  const colonIndex = decoded.indexOf(":");
  if (colonIndex === -1) return false;

  const password = decoded.slice(colonIndex + 1);
  return password === passphrase;
}
