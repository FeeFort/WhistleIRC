import { copyFile, chmod, rename, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

async function waitForExit(pid: number): Promise<void> {
  for (;;) {
    try {
      process.kill(pid, 0);
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
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
  await waitForExit(parentPid);
  const target = process.env.APPIMAGE || process.execPath;
  const pending = `${target}.pending-${process.pid}`;
  try {
    await copyFile(assetPath, pending);
    await chmod(pending, 0o755);
    await replaceFile(pending, target);
  } finally {
    await rm(pending, { force: true });
    await rm(path.dirname(assetPath), { recursive: true, force: true });
  }
  const child = spawn(target, [], { detached: true, stdio: "ignore" });
  child.unref();
}
