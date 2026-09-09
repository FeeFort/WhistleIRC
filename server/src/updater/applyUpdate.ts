import { ApplyUpdate } from "../types.js";
import { applyLinuxUpdate } from "./applyUpdate.linux.js";
import { applyMacosUpdate } from "./applyUpdate.macos.js";
import { applyWindowsUpdate } from "./applyUpdate.windows.js";

export function getApplyUpdate(): ApplyUpdate {
  if (process.platform === "win32") return applyWindowsUpdate;
  if (process.platform === "linux") return applyLinuxUpdate;
  if (process.platform === "darwin") return applyMacosUpdate;
  throw new Error(`Updates are not supported on ${process.platform}.`);
}

export async function applyPendingUpdate(parentPid: string | undefined, assetPath: string | undefined): Promise<void> {
  const pid = Number(parentPid);
  if (!Number.isInteger(pid) || pid <= 0 || !assetPath) throw new Error("Invalid update helper arguments.");
  await getApplyUpdate()(pid, assetPath);
}
