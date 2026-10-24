import { isIP } from "node:net";

const blockedHosts = new Set([
  "0.0.0.0",
  "169.254.169.254",
  "metadata.google.internal",
]);

export function isAllowedDestination(host: string, port: number): boolean {
  if (port < 1 || port > 65535) {
    return false;
  }

  const normalized = host.trim().toLowerCase();
  if (normalized.length === 0 || blockedHosts.has(normalized)) {
    return false;
  }

  if (normalized.startsWith("169.254.")) {
    return false;
  }

  if (
    normalized === "127.0.0.1" ||
    normalized === "localhost" ||
    normalized === "::1"
  ) {
    return true;
  }

  const allowedEnv = process.env.APPROVED_CONNECTOR_HOSTS;
  if (allowedEnv !== undefined && allowedEnv.length > 0) {
    const allowed = allowedEnv
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);
    return allowed.includes(normalized);
  }

  const ipFamily = isIP(normalized);
  if (ipFamily === 4) {
    if (
      normalized.startsWith("10.") ||
      normalized.startsWith("192.168.") ||
      normalized.startsWith("172.16.") ||
      normalized.startsWith("172.17.") ||
      normalized.startsWith("172.18.") ||
      normalized.startsWith("172.19.") ||
      normalized.startsWith("172.2") ||
      normalized.startsWith("172.30.") ||
      normalized.startsWith("172.31.")
    ) {
      return false;
    }
  }

  return true;
}

export function validateDestination(host: string, port: number): void {
  if (!isAllowedDestination(host, port)) {
    throw new Error(
      `Destination host is not permitted by policy: ${host}:${port}`,
    );
  }
}
