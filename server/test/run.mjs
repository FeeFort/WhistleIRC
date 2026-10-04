import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const serverDirectory = fileURLToPath(new URL("../", import.meta.url));
const testFiles = readdirSync(new URL("./", import.meta.url)).filter((name) => name.endsWith(".test.mjs")).sort();
if (!testFiles.length) throw new Error("No test files found.");

for (const file of testFiles) {
  const result = spawnSync(process.execPath, ["--import", "./node_modules/tsx/dist/loader.mjs", `test/${file}`], {
    cwd: serverDirectory,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = 1;
}
