import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger, createJsonFileSink, resolveFileLoggingOptions, createRuntimeFileSink } from "../src/logger/logger.ts";

test("independent file threshold, secret masking and ordered flush", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "whistle-threshold-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, "records.jsonl");
  const terminal = [];
  const log = new Logger({ level: "WARN", sink: (record) => terminal.push(record), fileSink: createJsonFileSink(file) });
  for (let index = 0; index < 50; index++) log.debug("Details", { index, password: "hidden", nested: { accessToken: "secret" }, error: new Error("Failed") });
  log.trace("Filtered");
  await log.flush();
  const records = readFileSync(file, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(terminal.length, 0);
  assert.equal(records.length, 50);
  assert.deepEqual(
    records.map((record) => record.fields.index),
    Array.from({ length: 50 }, (_, index) => index),
  );
  assert.equal(records[0].fields.password, "[redacted]");
  assert.equal(records[0].fields.nested.accessToken, "[redacted]");
  assert.equal(records[0].fields.error.stack, undefined);
});

test("date and size rotation clean old files while protecting active files", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "whistle-rotation-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sink = createRuntimeFileSink({ enabled: true, directory, maxFileBytes: 1, maxDirectoryBytes: 1 });
  const record = { timestamp: new Date("2026-10-06"), level: "INFO", scope: "core", component: "test", message: "First", fields: {} };
  sink(record);
  await sink.flush();
  sink({ ...record, timestamp: new Date("2026-10-07"), message: "Second" });
  await sink.flush();
  assert.equal(readdirSync(directory).length, 1);
  const file = readdirSync(directory)[0];
  assert.ok(file.includes("2026-10-07"));
  assert.equal(JSON.parse(readFileSync(join(directory, file), "utf8")).message, "Second");
  sink({ ...record, timestamp: new Date("2026-10-07"), message: "Third" });
  await sink.flush();
  assert.equal(readdirSync(directory).length, 1);
  assert.equal(JSON.parse(readFileSync(join(directory, readdirSync(directory)[0]), "utf8")).message, "Third");
});

test("file failures are isolated and reported only once", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "whistle-failure-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const warnings = [];
  t.mock.method(process.stderr, "write", (text) => {
    warnings.push(text);
    return true;
  });
  const log = new Logger({ sink: () => {}, fileSink: createJsonFileSink(directory) });
  log.info("First");
  log.info("Second");
  await log.flush();
  log.info("Third");
  await log.flush();
  assert.equal(warnings.length, 1);
});

test("TRACE files retain stacks and retention removes expired logs", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "whistle-retention-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, "trace.jsonl");
  const log = new Logger({ level: "TRACE", sink: () => {}, fileSink: createJsonFileSink(file) });
  log.warn("Failure", { error: new Error("Details") });
  await log.flush();
  assert.ok(JSON.parse(readFileSync(file, "utf8")).fields.error.stack.includes("loggerFile.test.mjs"));
  const sink = createRuntimeFileSink({ enabled: true, directory, retentionDays: 0 });
  const record = { timestamp: new Date("2026-10-06"), level: "INFO", scope: "core", component: "test", message: "Old", fields: {} };
  sink(record);
  await sink.flush();
  await new Promise((resolve) => setTimeout(resolve, 10));
  sink({ ...record, timestamp: new Date("2026-10-07") });
  await sink.flush();
  assert.equal(readdirSync(directory).filter((name) => name.startsWith("whistleref-")).length, 1);
  assert.ok(readdirSync(directory).includes("trace.jsonl"));
});

test("file logging paths and CLI overrides", () => {
  assert.equal(resolveFileLoggingOptions([], {}, "linux", "/tmp/home").directory, "/tmp/home/.local/state/WhistleRef/logs");
  assert.equal(resolveFileLoggingOptions([], { XDG_STATE_HOME: "/tmp/state" }, "linux", "/tmp/home").directory, "/tmp/state/WhistleRef/logs");
  assert.equal(resolveFileLoggingOptions([], {}, "darwin", "/tmp/home").directory, "/tmp/home/Library/Logs/WhistleRef");
  assert.equal(resolveFileLoggingOptions([], { LOCALAPPDATA: "/tmp/local" }, "win32", "/tmp/home").directory, "/tmp/local/WhistleRef/logs");
  assert.equal(resolveFileLoggingOptions(["--log-dir", "/tmp/cli"], { WHISTLEREF_LOG_DIR: "/tmp/env" }).directory, "/tmp/cli");
  assert.equal(resolveFileLoggingOptions(["--log-dir=/tmp/equal"]).directory, "/tmp/equal");
  assert.equal(resolveFileLoggingOptions(["--no-file-log"]).enabled, false);
  assert.equal(resolveFileLoggingOptions(["--", "--no-file-log"]).enabled, true);
  assert.throws(() => resolveFileLoggingOptions(["--log-dir"]));
});

test("runtime sink creates a directory and unique session files", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "whistle-runtime-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const logs = join(directory, "logs");
  for (let index = 0; index < 2; index++) {
    const log = new Logger({ sink: () => {}, fileSink: createRuntimeFileSink({ enabled: true, directory: logs }) });
    log.info("Started");
    await log.flush();
  }
  const files = readdirSync(logs);
  assert.equal(files.length, 2);
  assert.ok(files.every((file) => file.endsWith(".jsonl")));
  assert.equal(createRuntimeFileSink({ enabled: false, directory: logs }), undefined);
});

test("file sink appends JSONL alongside terminal records and respects filtering", async (t) => {
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
  await logger.flush();
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
