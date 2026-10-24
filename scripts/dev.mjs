import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = fileURLToPath(new URL("..", import.meta.url));
const children = [];
let stopping = false;

function signalChild(child, signal) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH")
      process.stderr.write("A local process could not be stopped.\n");
  }
}

function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) signalChild(child, "SIGTERM");
  const timer = setTimeout(() => {
    for (const child of children) signalChild(child, "SIGKILL");
  }, 5000);
  timer.unref();
}

function start(command, args, cwd, env = process.env, monitor = true) {
  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    detached: process.platform !== "win32",
    env,
  });
  children.push(child);
  child.once("error", () => {
    process.stderr.write(
      `Could not start ${args[0] ?? command}. Check installed dependencies.\n`,
    );
    stop(1);
  });
  if (monitor)
    child.once("exit", (code) => {
      if (!stopping) stop(code || 1);
    });
  return child;
}

async function run(args, cwd = root) {
  await new Promise((resolve, reject) => {
    const child = start(process.execPath, args, cwd, process.env, false);
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Local setup failed. Review the reported check.")),
    );
  });
}

async function available(url, headers) {
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(4000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function freePort(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(
        new Error(
          `Port ${port} is occupied. Stop its owner or set WEB_PORT/API_PORT explicitly.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop(0));
try {
  await run(["scripts/configure-local.mjs"]);
  const settings = parseEnv(await readFile(`${root}/backend/.env`, "utf8"));
  const apiPort = Number(process.env.API_PORT ?? settings.PORT ?? "3001");
  const webPort = Number(process.env.WEB_PORT ?? "3005");
  for (const port of [apiPort, webPort])
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("Use valid API_PORT and WEB_PORT values (1–65535).");
  if (apiPort === webPort)
    throw new Error("The frontend and API need separate ports.");
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const webUrl = `http://127.0.0.1:${webPort}`;
  if (await available(`${webUrl}/api/status`))
    throw new Error(`The frontend is already running at ${webUrl}.`);
  await freePort(webPort);
  const reuseApi = await available(`${apiUrl}/v1/files`, {
    Authorization: `Bearer ${settings.METIS_LOCAL_TOKEN}`,
  });
  if (!reuseApi) await freePort(apiPort);
  await run(
    ["--import", "tsx", "scripts/database.ts", "check"],
    `${root}/backend`,
  );
  const inferenceUrl =
    process.env.INFERENCE_BASE_URL ??
    settings.INFERENCE_BASE_URL ??
    "http://127.0.0.1:11434";
  if (!(await available(new URL("/api/tags", inferenceUrl)))) {
    const location = new URL(inferenceUrl);
    if (
      !["localhost", "127.0.0.1"].includes(location.hostname) ||
      location.port !== "11434"
    )
      throw new Error("The configured inference service is unavailable.");
    let ollama = process.env.OLLAMA_BIN ?? "/opt/homebrew/bin/ollama";
    try {
      await access(ollama);
    } catch {
      ollama = "ollama";
    }
    start(ollama, ["serve"], root);
    let ready = false;
    for (let attempt = 0; attempt < 30 && !stopping; attempt++) {
      if (await available(new URL("/api/tags", inferenceUrl))) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (!ready)
      throw new Error(
        "Ollama could not start. Install Ollama and pull the model specified in inference/model.json.",
      );
  }
  if (stopping) throw new Error("Startup cancelled.");
  if (!reuseApi)
    start(
      process.execPath,
      ["--import", "tsx", "--watch", "src/server.ts"],
      `${root}/backend`,
      { ...process.env, HOST: "127.0.0.1", PORT: String(apiPort) },
    );
  start(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(webPort),
    ],
    `${root}/frontend`,
  );
  process.stdout.write(
    `Frontend: ${webUrl}\nAPI: ${apiUrl}${reuseApi ? " (reusing configured service)" : ""}\nNeon storage configured. Ctrl+C stops services started by this command.\n`,
  );
} catch (error) {
  if (!stopping)
    process.stderr.write(
      `${error instanceof Error ? error.message : "Local startup failed."}\n`,
    );
  stop(1);
}
