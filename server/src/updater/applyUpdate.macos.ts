import { cp, mkdtemp, rename, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";
import os from "node:os";
import path from "node:path";

const execFile = promisify(execFileCallback);

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

export async function applyMacosUpdate(parentPid: number, assetPath: string): Promise<void> {
  await waitForExit(parentPid);
  const appRoot = process.execPath.slice(0, process.execPath.indexOf(".app/") + 4);
  if (!appRoot.endsWith(".app")) throw new Error("The current application bundle could not be located.");
  const extractDirectory = await mkdtemp(path.join(os.tmpdir(), "whistleirc-install-"));
  try {
    await execFile("ditto", ["-x", "-k", assetPath, extractDirectory]);
    const sourceApp = path.join(extractDirectory, path.basename(appRoot));
    await cp(sourceApp, `${appRoot}.pending`, { recursive: true, force: true });
    await rename(appRoot, `${appRoot}.previous`);
    try {
      await rename(`${appRoot}.pending`, appRoot);
    } catch (error) {
      await rename(`${appRoot}.previous`, appRoot);
      throw error;
    }
    await rm(`${appRoot}.previous`, { recursive: true, force: true });
  } finally {
    await rm(extractDirectory, { recursive: true, force: true });
    await rm(path.dirname(assetPath), { recursive: true, force: true });
  }
  const child = spawn(process.execPath, [], { detached: true, stdio: "ignore" });
  child.unref();
}
