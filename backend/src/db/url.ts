export function normalizedDatabaseUrl(input: string): URL {
  const url = new URL(input);
  url.hostname = url.hostname.toLowerCase().replace(/\.+$/u, "");
  return url;
}
