import test from "node:test";
import assert from "node:assert/strict";
import { Logger, LOG_LEVELS, resolveLoggerOptions } from "../src/logger/logger.ts";

test("interleaved operations keep distinct IDs and monotonic durations", () => {
  const records = [];
  let time = 100;
  const root = new Logger({ level: "TRACE", sink: (record) => records.push(record), monotonicNow: () => time });
  const first = root.child("lazer", "refereeHub").traceStart("MakeRoom", { beatmapId: 123 });
  time = 110;
  const second = root.child("stable", "irc").traceStart("Settings");
  time = 125;
  second.end({ roomId: 456 });
  time = 180;
  first.end({ roomId: 123 });
  assert.notEqual(first.id, second.id);
  assert.deepEqual(
    records.map((record) => record.operation),
    [
      { id: first.id, phase: "start" },
      { id: second.id, phase: "start" },
      { id: second.id, phase: "end", durationMs: 15 },
      { id: first.id, phase: "end", durationMs: 80 },
    ],
  );
  assert.equal(records[2].scope, "stable");
  assert.equal(records[3].scope, "lazer");
});

test("operation failures are visible at WARN without evaluating disabled payloads", () => {
  const records = [];
  let evaluations = 0;
  const log = new Logger({ sink: (record) => records.push(record), monotonicNow: () => 0 });
  const details = () => {
    evaluations++;
    return { payload: "details" };
  };
  const success = log.traceStart("Successful request", details);
  success.end(details);
  assert.equal(records.length, 0);
  assert.equal(evaluations, 0);
  const failure = log.traceStart("Failed request", details);
  const error = new Error("Disconnected");
  failure.fail(error);
  assert.equal(records.length, 1);
  assert.equal(records[0].level, "WARN");
  assert.equal(records[0].operation.id, failure.id);
  assert.deepEqual(records[0].fields.error, { name: "Error", message: error.message });
  assert.equal(evaluations, 0);
});

test("operations finish once and ignore payloads from duplicate completions", () => {
  const records = [];
  const log = new Logger({ level: "TRACE", sink: (record) => records.push(record) });
  for (const failFirst of [false, true]) {
    const operation = log.traceStart("Request");
    if (failFirst) operation.fail(new Error("Failed"), "ERROR");
    else operation.end();
    const details = () => {
      throw new Error("Duplicate completion evaluated");
    };
    operation.end(details);
    operation.fail(new Error("Late failure"), "WARN", details);
  }
  assert.equal(records.length, 4);
  assert.equal(records[3].level, "ERROR");
});

test("network directions are separate from operation boundaries", () => {
  const records = [];
  const log = new Logger({ level: "TRACE", sink: (record) => records.push(record) });
  log.traceIn("PING");
  log.traceOut("PONG");
  assert.deepEqual(
    records.map((record) => record.message),
    ["← PING", "→ PONG"],
  );
  assert.ok(records.every((record) => record.operation === undefined));
});

test("separators respect thresholds and retain structured context", () => {
  const records = [];
  const log = new Logger({ level: "WARN", sink: (record) => records.push(record) }).child("lazer", "session");
  log.separator("Starting session");
  assert.equal(records.length, 0);
  log.separator("Reconnecting", "WARN");
  assert.equal(records[0].kind, "separator");
  assert.equal(records[0].scope, "lazer");
  assert.equal(records[0].message, "Reconnecting");
});

test("TTY banner appears once even at WARN and across children", (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
  Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: true });
  t.after(() => {
    if (descriptor) Object.defineProperty(process.stderr, "isTTY", descriptor);
    else delete process.stderr.isTTY;
  });
  const records = [];
  const log = new Logger({ level: "WARN", sink: (record) => records.push(record) });
  const info = { version: "1.2.3", url: "http://localhost:3000", nodeVersion: "v24.0.0", os: "Linux", arch: "x64" };
  log.startupBanner(info);
  log.child("core", "server").startupBanner(info);
  assert.equal(records.length, 1);
  assert.equal(records[0].kind, "banner");
  assert.deepEqual(records[0].banner, { ...info, level: "WARN" });
});

test("non-TTY startup uses an INFO record and respects filtering", (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
  Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: false });
  t.after(() => {
    if (descriptor) Object.defineProperty(process.stderr, "isTTY", descriptor);
    else delete process.stderr.isTTY;
  });
  const records = [];
  const info = { version: "1.2.3", url: "http://localhost:3000", nodeVersion: "v24.0.0", os: "Linux", arch: "x64" };
  new Logger({ level: "WARN", sink: (record) => records.push(record) }).startupBanner(info);
  assert.equal(records.length, 0);
  new Logger({ level: "INFO", sink: (record) => records.push(record) }).startupBanner(info);
  assert.equal(records.length, 1);
  assert.equal(records[0].kind, undefined);
  assert.equal(records[0].fields.os, "Linux");
});

test("logging flags select the most detailed level regardless of order", () => {
  const cases = [
    [[], "INFO"],
    [["-q"], "WARN"],
    [["--quiet"], "WARN"],
    [["-v"], "DEBUG"],
    [["--verbose"], "DEBUG"],
    [["-d"], "TRACE"],
    [["--debug"], "TRACE"],
    [["-q", "--verbose", "-d"], "TRACE"],
    [["-v", "--debug"], "TRACE"],
    [["-vqd"], "TRACE"],
    [["--updated", "--platform=linux"], "INFO"],
    [["--", "--debug", "--no-color"], "INFO"],
    [["-v", "--", "-d"], "DEBUG"],
    [["-q", "-v"], "DEBUG"],
    [["-v", "-q"], "DEBUG"],
    [["-t"], "INFO"],
    [["--trace"], "INFO"],
  ];
  for (const [args, level] of cases) assert.equal(resolveLoggerOptions(args, {}, true).level, level);
});

test("colors require stderr TTY and respect explicit disabling", () => {
  assert.equal(resolveLoggerOptions([], {}, true).colors, true);
  assert.equal(resolveLoggerOptions([], {}, false).colors, false);
  assert.equal(resolveLoggerOptions(["--no-color"], {}, true).colors, false);
  for (const NO_COLOR of ["", "0", "1"]) assert.equal(resolveLoggerOptions([], { NO_COLOR }, true).colors, false);
  assert.equal(resolveLoggerOptions([], { FORCE_COLOR: "1" }, false).colors, false);
  assert.equal(resolveLoggerOptions(["--no-color"], { FORCE_COLOR: "1" }, true).colors, false);
  assert.equal(resolveLoggerOptions(["--", "--no-color"], {}, true).colors, true);
});

test("resolved settings are shared with child loggers", () => {
  const root = new Logger({ ...resolveLoggerOptions(["-d", "--no-color"], {}, true), sink: () => {} });
  const child = root.child("lazer", "refereeHub");
  assert.equal(child.level, "TRACE");
  assert.equal(child.colors, false);
});

test("each threshold includes exactly its level and more severe levels", () => {
  for (const [index, level] of LOG_LEVELS.entries()) {
    const records = [];
    const log = new Logger({ level, sink: (record) => records.push(record) });
    for (const candidate of LOG_LEVELS) log[candidate.toLowerCase()](candidate);
    assert.deepEqual(
      records.map((record) => record.level),
      LOG_LEVELS.slice(0, index + 1),
    );
  }
});

test("default threshold is INFO and critical logging does not terminate", () => {
  const records = [];
  const log = new Logger({ sink: (record) => records.push(record) });
  for (const level of LOG_LEVELS) log.log(level, "message");
  assert.deepEqual(
    records.map((record) => record.level),
    ["CRITICAL", "ERROR", "WARN", "INFO"],
  );
});

test("children share configuration while preserving their own context", () => {
  const records = [];
  const timestamp = new Date("2026-10-06T10:00:00.000Z");
  const root = new Logger({ sink: (record) => records.push(record), now: () => timestamp });
  const lazer = root.child("lazer", "refereeHub");
  const stable = root.child("stable", "irc");
  root.setLevel("DEBUG");
  lazer.debug("Connected", { roomId: 123 });
  stable.info("Connected");
  root.warn("Warning");
  assert.deepEqual(records[0], { timestamp, level: "DEBUG", scope: "lazer", component: "refereeHub", message: "Connected", fields: { roomId: 123 } });
  assert.equal(records[1].scope, "stable");
  assert.equal(records[1].component, "irc");
  assert.equal(records[2].scope, "core");
  lazer.setLevel("ERROR");
  assert.equal(root.level, "ERROR");
  assert.equal(stable.isEnabled("WARN"), false);
});

test("disabled logs do not evaluate fields or obtain timestamps", () => {
  let evaluations = 0;
  let timestamps = 0;
  const records = [];
  const log = new Logger({
    sink: (record) => records.push(record),
    now: () => {
      timestamps++;
      return new Date();
    },
  });
  const fields = () => {
    evaluations++;
    return { payload: "details" };
  };
  log.trace("Packet", fields);
  assert.equal(evaluations, 0);
  assert.equal(timestamps, 0);
  log.setLevel("TRACE");
  log.trace("Packet", fields);
  assert.equal(evaluations, 1);
  assert.equal(timestamps, 1);
  assert.deepEqual(records[0].fields, { payload: "details" });
});
