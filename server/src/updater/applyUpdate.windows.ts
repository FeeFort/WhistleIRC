import { copyFile, mkdtemp, rename, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
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

export async function applyWindowsUpdate(parentPid: number, assetPath: string): Promise<void> {
  await waitForExit(parentPid);
  const target = process.execPath;
  const pending = path.join(await mkdtemp(path.join(os.tmpdir(), "whistleirc-install-")), path.basename(target));
  try {
    await copyFile(assetPath, pending);
    await rename(target, `${target}.previous`);
    try {
      await rename(pending, target);
    } catch (error) {
      await rename(`${target}.previous`, target);
      throw error;
    }
    await rm(`${target}.previous`, { force: true });
  } finally {
    await rm(path.dirname(pending), { recursive: true, force: true });
    await rm(path.dirname(assetPath), { recursive: true, force: true });
  }
  const child = spawn(target, [], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}
