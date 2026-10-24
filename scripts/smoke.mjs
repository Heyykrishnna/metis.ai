import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout } from "node:timers/promises";

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Cannot allocate smoke-test port");
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}
async function waitFor(url, child) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null)
      throw new Error("Application exited before becoming ready");
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return response;
    } catch (error) {
      if (!(error instanceof Error)) throw error;
    }
    await setTimeout(200);
  }
  throw new Error("Application startup exceeded smoke-test budget");
}
const apiPort = await freePort();
const webPort = await freePort();
const api = spawn(process.execPath, ["backend/dist/server.js"], {
  env: {
    ...process.env,
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: String(apiPort),
    LOG_LEVEL: "silent",
  },
  stdio: "pipe",
});
const frontend = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "-H",
    "127.0.0.1",
    "-p",
    String(webPort),
  ],
  { stdio: "pipe", cwd: process.cwd() + "/frontend" },
);
try {
  const health = await waitFor(`http://127.0.0.1:${apiPort}/health`, api);
  assert.deepEqual(await health.json(), { status: "ok" });
  const home = await waitFor(`http://127.0.0.1:${webPort}`, frontend);
  const html = await home.text();
  assert.match(html, /<title>metis\.ai<\/title>/);
  assert.match(html, /<main/);
  process.stdout.write(
    "API health and production frontend HTTP smoke checks passed\n",
  );
} finally {
  for (const child of [api, frontend]) {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
  }
}
