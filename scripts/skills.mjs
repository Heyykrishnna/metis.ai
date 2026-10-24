import { createHash } from "node:crypto";
import {
  readdir,
  readFile,
  lstat,
  mkdir,
  symlink,
  readlink,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { relative, join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const canonical = join(root, ".agents/skills");
const manifest = JSON.parse(
  await readFile(join(root, "skills.lock.json"), "utf8"),
);

async function files(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await files(path)));
    else if (entry.isFile()) paths.push(path);
    else throw new Error(`Unexpected skill entry: ${relative(root, path)}`);
  }
  return paths.sort();
}
const actual = await files(canonical);
const expected = Object.keys(manifest.files).sort();
if (
  JSON.stringify(actual.map((path) => relative(canonical, path)).sort()) !==
  JSON.stringify(expected)
) {
  throw new Error("Canonical skill files differ from skills.lock.json");
}
for (const path of actual) {
  const digest = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
  if (digest !== manifest.files[relative(canonical, path)])
    throw new Error(`Skill content changed: ${relative(root, path)}`);
}
const skillDirectories = (
  await readdir(canonical, { withFileTypes: true })
).filter((entry) => entry.isDirectory());
if (process.argv.includes("--link"))
  await mkdir(join(root, "skills"), { recursive: true });
for (const skill of skillDirectories) {
  await readFile(join(canonical, skill.name, "SKILL.md"), "utf8");
  const alias = join(root, "skills", skill.name);
  let exists = true;
  try {
    await lstat(alias);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    exists = false;
  }
  if (!exists && process.argv.includes("--link"))
    await symlink(join("..", ".agents", "skills", skill.name), alias);
  if ((await readlink(alias)) !== join("..", ".agents", "skills", skill.name))
    throw new Error(`Skill alias target must be canonical: ${skill.name}`);
  const target = await readFile(join(alias, "SKILL.md"), "utf8");
  if (
    target !== (await readFile(join(canonical, skill.name, "SKILL.md"), "utf8"))
  )
    throw new Error(`Skill alias mismatch: ${skill.name}`);
  if (!(await lstat(alias)).isSymbolicLink())
    throw new Error(`Skill alias must be a link: ${skill.name}`);
}
process.stdout.write(
  `Verified ${skillDirectories.length} skill links and ${actual.length} canonical file hashes\n`,
);
