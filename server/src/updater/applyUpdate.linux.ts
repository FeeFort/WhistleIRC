import { appendFile, copyFile, chmod, readFile, rename, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

async function waitForExit(pid: number): Promise<void> {
  const startedAt = Date.now();
  for (;;) {
    try {
      const stat = await readFile(`/proc/${pid}/stat`, "utf8");
      if (stat.match(/^\d+ \([^)]*\) Z /)) return;
      process.kill(pid, 0);
      if (Date.now() - startedAt > 30_000) throw new Error("Timed out waiting for the application to exit.");
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

async function replaceFile(source: string, target: string): Promise<void> {
  const backup = `${target}.previous-${process.pid}`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await rename(target, backup);
      try {
        await rename(source, target);
      } catch (error) {
        await rename(backup, target).catch(() => undefined);
        throw error;
      }
      await rm(backup, { force: true });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError;
}

export async function applyLinuxUpdate(parentPid: number, assetPath: string): Promise<void> {
  const logPath = `${process.env.TMPDIR || "/tmp"}/whistleirc-update-error.log`;
  const log = async (message: string) => appendFile(logPath, `${new Date().toISOString()} ${message}\n`).catch(() => undefined);
  await log(`Linux update helper started (parent=${parentPid}, asset=${assetPath})`);
  try {
    await waitForExit(parentPid);
    const target = process.env.APPIMAGE || process.execPath;
    const pending = `${target}.pending-${process.pid}`;
    try {
      await copyFile(assetPath, pending);
      await chmod(pending, 0o755);
      await replaceFile(pending, target);
    } finally {
      await rm(pending, { force: true });
    }
    await rm(path.dirname(assetPath), { recursive: true, force: true });
    const child = spawn(target, ["--updated"], { detached: true, stdio: "ignore" });
    child.unref();
  } catch (error) {
    await log(`Linux update failed: ${(error as Error).stack || (error as Error).message}`);
    throw error;
  }
}
