import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import semver from "semver";
import { GithubAsset, GithubRelease, UpdateCheckResult, UpdateInfo, UpdateProgressSender, UpdaterState } from "../types.js";

declare const __APP_VERSION__: string;

const GITHUB_OWNER = "FeeFort";
const GITHUB_REPO = "WhistleIRC-test";

export class UpdateError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function currentVersion(): string {
  return typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";
}

function isPackagedRuntime(): boolean {
  return Boolean((process as NodeJS.Process & { pkg?: unknown }).pkg) || Boolean(process.env.APPIMAGE);
}

function getAssetExtension(): string {
  if (process.platform === "win32") return ".exe";
  if (process.platform === "linux") return ".AppImage";
  if (process.platform === "darwin") return ".zip";
  throw new UpdateError("UNSUPPORTED_PLATFORM", `Updates are not supported on ${process.platform}.`);
}

function findAsset(assets: GithubAsset[]): GithubAsset {
  const extension = getAssetExtension();
  const asset = assets.find((item) => item.name.endsWith(extension) && item.name.includes(process.arch));
  if (!asset) {
    throw new UpdateError("ASSET_NOT_FOUND", `No update package is available for ${process.platform}/${process.arch}.`);
  }
  if (!/^[-._a-zA-Z0-9]+$/.test(asset.name)) {
    throw new UpdateError("INVALID_ASSET", "The update package has an unsafe filename.");
  }
  return asset;
}

function checksumFromDigest(digest: string | undefined): string {
  const match = /^sha256:([a-f0-9]{64})$/i.exec(digest || "");
  if (!match) throw new UpdateError("CHECKSUM_MISSING", "The release does not provide a SHA-256 checksum.");
  return match[1].toLowerCase();
}

export class UpdateManager {
  #state: UpdaterState = "idle";
  #target: UpdateInfo | null = null;
  #downloadPath: string | null = null;
  #stagingDirectory: string | null = null;
  #abortController: AbortController | null = null;

  async check(): Promise<UpdateCheckResult> {
    if (this.#state === "checking" || this.#state === "downloading" || this.#state === "installing") {
      throw new UpdateError("UPDATE_IN_PROGRESS", "An update operation is already in progress.");
    }

    this.#state = "checking";
    try {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "WhistleIRC-Updater" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new UpdateError("CHECK_FAILED", `GitHub responded with HTTP ${response.status}.`);

      const release = (await response.json()) as GithubRelease;
      const latestVersion = release.tag_name?.replace(/^v/, "");
      if (!latestVersion || !semver.valid(latestVersion)) {
        throw new UpdateError("INVALID_RELEASE", "The latest GitHub release has an invalid version tag.");
      }

      const version = currentVersion();
      if (!semver.valid(version)) throw new UpdateError("INVALID_CURRENT_VERSION", "The current application version is invalid.");
      if (!semver.gt(latestVersion, version)) {
        this.#target = null;
        this.#state = "idle";
        return { type: "update_check_result", available: false, currentVersion: version };
      }

      const asset = findAsset(release.assets || []);
      checksumFromDigest(asset.digest);
      this.#target = { version: latestVersion, asset, releaseNotesUrl: release.html_url, publishedAt: release.published_at };
      this.#state = "available";
      return {
        type: "update_check_result",
        available: true,
        currentVersion: version,
        latestVersion,
        releaseNotesUrl: release.html_url,
        publishedAt: release.published_at,
      };
    } catch (error) {
      this.#state = "idle";
      if (error instanceof UpdateError) throw error;
      throw new UpdateError("CHECK_FAILED", `Unable to check for updates: ${(error as Error).message}`);
    }
  }

  async download(send: UpdateProgressSender): Promise<void> {
    if (this.#state !== "available" || !this.#target) {
      throw new UpdateError("INVALID_UPDATE_STATE", "Check for an available update before downloading it.");
    }

    this.#state = "downloading";
    this.#abortController = new AbortController();
    try {
      this.#stagingDirectory = await mkdtemp(path.join(os.tmpdir(), "whistleirc-update-"));
      this.#downloadPath = path.join(this.#stagingDirectory, this.#target.asset.name);
      const response = await fetch(this.#target.asset.browser_download_url, { signal: this.#abortController.signal });
      if (!response.ok || !response.body) throw new UpdateError("DOWNLOAD_FAILED", `Download failed with HTTP ${response.status}.`);

      const totalBytes = Number(response.headers.get("content-length")) || this.#target.asset.size;
      let downloadedBytes = 0;
      const hash = createHash("sha256");
      const progress = new Transform({
        transform(chunk, _encoding, callback) {
          downloadedBytes += chunk.length;
          hash.update(chunk);
          send({ type: "update_progress", stage: "downloading", totalBytes, downloadedBytes });
          callback(null, chunk);
        },
      });
      await pipeline(Readable.fromWeb(response.body as never), progress, fs.createWriteStream(this.#downloadPath));

      send({ type: "update_progress", stage: "verifying" });
      if (downloadedBytes !== this.#target.asset.size || hash.digest("hex") !== checksumFromDigest(this.#target.asset.digest)) {
        throw new UpdateError("VERIFY_FAILED", "The downloaded update did not pass integrity verification.");
      }
      this.#state = "ready_to_install";
      send({ type: "update_progress", stage: "ready_to_install" });
    } catch (error) {
      await this.#removeDownload();
      this.#state = this.#target ? "available" : "idle";
      if (this.#abortController?.signal.aborted) throw new UpdateError("DOWNLOAD_CANCELLED", "The update download was cancelled.");
      if (error instanceof UpdateError) throw error;
      throw new UpdateError("DOWNLOAD_FAILED", `Unable to download the update: ${(error as Error).message}`);
    } finally {
      this.#abortController = null;
    }
  }

  async cancel(): Promise<void> {
    if (this.#state !== "downloading" || !this.#abortController) {
      throw new UpdateError("INVALID_UPDATE_STATE", "There is no active update download to cancel.");
    }
    this.#abortController.abort();
  }

  install(send: UpdateProgressSender): void {
    if (this.#state !== "ready_to_install" || !this.#downloadPath) {
      throw new UpdateError("INVALID_UPDATE_STATE", "Download and verify an update before installing it.");
    }
    if (!isPackagedRuntime()) {
      throw new UpdateError("INSTALL_UNSUPPORTED_RUNTIME", "Updates can only be installed from a packaged application.");
    }
    this.#state = "installing";
    send({ type: "update_progress", stage: "installing" });
    const helperPath = path.join(this.#stagingDirectory || os.tmpdir(), `whistleirc-update-helper-${process.pid}`);
    try {
      fs.copyFileSync(process.execPath, helperPath);
      fs.chmodSync(helperPath, 0o755);
    } catch (error) {
      this.#state = "ready_to_install";
      throw new UpdateError("HELPER_PREPARE_FAILED", `Unable to prepare the update helper: ${(error as Error).message}`);
    }
    const helper = spawn(helperPath, ["--apply-update", String(process.pid), this.#downloadPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: { ...process.env, WHISTLEIRC_UPDATE_HELPER: "1" },
    });
    helper.once("error", (error) => {
      fs.appendFileSync(`${os.tmpdir()}/whistleirc-update-error.log`, `${new Date().toISOString()} Helper spawn failed: ${error.stack || error.message}\n`);
    });
    helper.unref();
  }

  async #removeDownload(): Promise<void> {
    if (this.#stagingDirectory) await rm(this.#stagingDirectory, { recursive: true, force: true });
    this.#stagingDirectory = null;
    this.#downloadPath = null;
  }
}
