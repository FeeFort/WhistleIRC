import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger, createJsonFileSink, resolveFileLoggingOptions, createRuntimeFileSink } from "../src/logger.ts";

test("file logging paths and CLI overrides", () => {
  assert.equal(resolveFileLoggingOptions([], {}, "linux", "/tmp/home").directory, "/tmp/home/.local/state/WhistleIRC/logs");
  assert.equal(resolveFileLoggingOptions([], { XDG_STATE_HOME: "/tmp/state" }, "linux", "/tmp/home").directory, "/tmp/state/WhistleIRC/logs");
  assert.equal(resolveFileLoggingOptions([], {}, "darwin", "/tmp/home").directory, "/tmp/home/Library/Logs/WhistleIRC");
  assert.equal(resolveFileLoggingOptions([], { LOCALAPPDATA: "/tmp/local" }, "win32", "/tmp/home").directory, "/tmp/local/WhistleIRC/logs");
  assert.equal(resolveFileLoggingOptions(["--log-dir", "/tmp/cli"], { WHISTLEIRC_LOG_DIR: "/tmp/env" }).directory, "/tmp/cli");
  assert.equal(resolveFileLoggingOptions(["--log-dir=/tmp/equal"]).directory, "/tmp/equal");
  assert.equal(resolveFileLoggingOptions(["--no-file-log"]).enabled, false);
  assert.equal(resolveFileLoggingOptions(["--", "--no-file-log"]).enabled, true);
  assert.throws(() => resolveFileLoggingOptions(["--log-dir"]));
});

test("runtime sink creates a directory and unique session files", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "whistle-runtime-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const logs = join(directory, "logs");
  for (let index = 0; index < 2; index++) {
    new Logger({ sink: () => {}, fileSink: createRuntimeFileSink({ enabled: true, directory: logs }) }).info("Started");
  }
  const files = readdirSync(logs);
  assert.equal(files.length, 2);
  assert.ok(files.every((file) => file.endsWith(".jsonl")));
  assert.equal(createRuntimeFileSink({ enabled: false, directory: logs }), undefined);
});

test("file sink appends JSONL alongside terminal records and respects filtering", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "whistle-logs-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "server.jsonl");
  const timestamp = new Date("2026-10-06T12:00:00.000Z");
  const terminal = [];
  const logger = new Logger({ sink: (record) => terminal.push(record), fileSink: createJsonFileSink(path), now: () => timestamp });
  const log = logger.child("lazer", "refereeHub");
  log.info("Connected", { roomId: 123 });
  log.trace("Hidden");
  log.warn("\u001b[31mFailed\u001b[0m", { error: new Error("Failure"), count: 1n });
  const lines = readFileSync(path, "utf8").trimEnd().split("\n");
  assert.equal(lines.length, 2);
  assert.equal(terminal.length, 2);
  assert.deepEqual(JSON.parse(lines[0]), { timestamp: timestamp.toISOString(), level: "INFO", scope: "lazer", component: "refereeHub", message: "Connected", fields: { roomId: 123 } });
  const failed = JSON.parse(lines[1]);
  assert.equal(failed.message, "Failed");
  assert.equal(failed.fields.error.message, "Failure");
  assert.equal(failed.fields.count, "1");
  assert.ok(!lines.join("").includes("\u001b"));
  assert.ok(!lines.join("").includes("┃"));
});
