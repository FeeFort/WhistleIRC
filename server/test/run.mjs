import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import colors from "ansi-colors";

colors.enabled = !process.env.NO_COLOR && !process.env.NODE_DISABLE_COLORS && (process.env.FORCE_COLOR ? process.env.FORCE_COLOR !== "0" : Boolean(process.stdout.isTTY));

const serverDirectory = fileURLToPath(new URL("../", import.meta.url));
const testFiles = readdirSync(new URL("./", import.meta.url))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort();
if (!testFiles.length) throw new Error("No test files found.");

const verbose = process.argv.includes("--verbose") || process.argv.includes("-v");
const startedAt = performance.now();
let passedFiles = 0;
let totalTests = 0;
let failedTests = 0;

const fileWidth = Math.max(...testFiles.map((file) => file.length));
console.log(`\n${colors.bold.cyan("◆ WhistleIRC · Server tests")}`);
console.log(`${colors.dim(`Running ${testFiles.length} test files`)}\n`);

for (const file of testFiles) {
  const fileStartedAt = performance.now();
  const result = spawnSync(process.execPath, ["--import", "./node_modules/tsx/dist/loader.mjs", `test/${file}`], {
    cwd: serverDirectory,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0", NODE_DISABLE_COLORS: "1" },
  });
  if (result.error) throw result.error;
  const output = result.stdout + result.stderr;
  const tests = Number(output.match(/ℹ tests (\d+)/)?.[1] ?? 0);
  const failures = Number(output.match(/ℹ fail (\d+)/)?.[1] ?? 0);
  const passed = result.status === 0;
  totalTests += tests;
  failedTests += failures;
  if (passed) passedFiles++;
  else process.exitCode = 1;

  const duration = ((performance.now() - fileStartedAt) / 1000).toFixed(2);
  const status = passed ? colors.bold.green("✔ PASS") : colors.bold.red("✖ FAIL");
  console.log(`  ${status}  ${colors.bold(file.padEnd(fileWidth))}  ${colors.dim(`${String(tests).padStart(2)} tests · ${duration}s`)}`);
  if (!passed || verbose) {
    console.log(colors.dim(`\n  ── ${file} · details ──`));
    console.log(output.trimEnd());
    if (result.signal) console.log(`Process terminated by ${result.signal}`);
    console.log();
  }
}

const failedFiles = testFiles.length - passedFiles;
const failureCount = (count) => (count ? colors.bold.red(`${count} failed`) : colors.dim("0 failed"));
console.log(`\n${colors.dim("────────────────────────────────────────────────────────")}`);
console.log(failedFiles ? colors.bold.red("✖ Some tests failed") : colors.bold.green("✔ All tests passed"));
console.log(`  ${colors.bold("Files")}  ${colors.green(`${passedFiles} passed`)} · ${failureCount(failedFiles)}`);
console.log(`  ${colors.bold("Tests")}  ${totalTests} total · ${failureCount(failedTests)}`);
console.log(`  ${colors.bold("Time ")}  ${colors.dim(`${((performance.now() - startedAt) / 1000).toFixed(2)}s`)}\n`);
