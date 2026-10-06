import { formatLogRecord } from "./loggerFormat.js";
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { stripVTControlCharacters } from "node:util";
import type {
  LogFieldsInput,
  LogLevel,
  LoggerOptions,
  LoggerRuntimeOptions,
  LoggerState,
  LogScope,
  StartupBannerInfo,
  TraceOperation,
  TraceOperationDetails,
  LogFileSink,
  LogSink,
  FileLoggingOptions,
} from "./types.js";

// Levels go from most severe to most detailed
export const LOG_LEVELS = ["CRITICAL", "ERROR", "WARN", "INFO", "DEBUG", "TRACE"] as const;

export function resolveFileLoggingOptions(
  args: readonly string[] = process.argv.slice(2),
  environment: Readonly<Record<string, string | undefined>> = process.env,
  platform: string = process.platform,
  home = homedir(),
): FileLoggingOptions {
  const separator = args.indexOf("--");
  const flags = separator < 0 ? args : args.slice(0, separator);
  let directory = environment.WHISTLEIRC_LOG_DIR;
  for (let index = 0; index < flags.length; index++) {
    const arg = flags[index];
    if (arg === "--log-dir") {
      const value = flags[++index];
      if (!value || value.startsWith("--")) throw new Error("--log-dir requires a directory path");
      directory = value;
    } else if (arg.startsWith("--log-dir=")) {
      directory = arg.slice("--log-dir=".length);
      if (!directory) throw new Error("--log-dir requires a directory path");
    }
  }
  if (!directory) {
    if (platform === "win32") directory = path.join(environment.LOCALAPPDATA || path.join(home, "AppData", "Local"), "WhistleIRC", "logs");
    else if (platform === "darwin") directory = path.join(home, "Library", "Logs", "WhistleIRC");
    else directory = path.join(environment.XDG_STATE_HOME && path.isAbsolute(environment.XDG_STATE_HOME) ? environment.XDG_STATE_HOME : path.join(home, ".local", "state"), "WhistleIRC", "logs");
  }
  return { enabled: !flags.includes("--no-file-log"), directory: path.resolve(directory) };
}

export function createRuntimeFileSink(options: FileLoggingOptions): LogFileSink | undefined {
  if (!options.enabled) return undefined;
  let sink: LogFileSink | undefined;
  let disabled = false;
  return (record) => {
    if (disabled) return;
    try {
      if (!sink) {
        mkdirSync(options.directory, { recursive: true });
        const name = `whistleirc-${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}-${randomUUID()}.jsonl`;
        sink = createJsonFileSink(path.join(options.directory, name));
      }
      sink(record);
    } catch (error) {
      disabled = true;
      process.stderr.write(`File logging disabled: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  };
}

function jsonValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return stripVTControlCharacters(value);
  if (typeof value === "bigint") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  try {
    if (value instanceof Error) {
      const result: Record<string, unknown> = { name: jsonValue(value.name), message: jsonValue(value.message) };
      if (value.stack) result.stack = jsonValue(value.stack);
      for (const [key, item] of Object.entries(value)) result[key] = jsonValue(item, seen);
      if (value.cause !== undefined) result.cause = jsonValue(value.cause, seen);
      if (value instanceof AggregateError) result.errors = jsonValue(value.errors, seen);
      return result;
    }
    if (Array.isArray(value)) return value.map((item) => jsonValue(item, seen));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonValue(item, seen)]));
  } finally {
    seen.delete(value);
  }
}

export function createJsonFileSink(filePath: string): LogFileSink {
  return (record) => {
    const line = JSON.stringify({
      timestamp: record.timestamp.toISOString(),
      level: record.level,
      scope: record.scope,
      component: record.component,
      message: stripVTControlCharacters(record.message),
      fields: jsonValue(record.fields),
      ...(record.operation ? { operation: record.operation } : {}),
      ...(record.kind ? { kind: record.kind } : {}),
      ...(record.banner ? { banner: jsonValue(record.banner) } : {}),
    });
    appendFileSync(filePath, `${line}\n`, "utf8");
  };
}

export function resolveLoggerOptions(
  args: readonly string[] = process.argv.slice(2),
  environment: Readonly<Record<string, string | undefined>> = process.env,
  isTTY = Boolean(process.stderr.isTTY),
): LoggerRuntimeOptions {
  const separator = args.indexOf("--");
  const flags = new Set((separator === -1 ? args : args.slice(0, separator)).flatMap((arg) => (/^-[vdq]+$/.test(arg) ? [...arg.slice(1)].map((flag) => `-${flag}`) : [arg])));
  const level = flags.has("--debug") || flags.has("-d") ? "TRACE" : flags.has("--verbose") || flags.has("-v") ? "DEBUG" : flags.has("--quiet") || flags.has("-q") ? "WARN" : "INFO";
  return { level, colors: isTTY && environment.NO_COLOR === undefined && !flags.has("--no-color") };
}

export class Logger {
  private state: LoggerState;
  readonly scope: LogScope;
  readonly component: string;

  constructor(options: LoggerOptions = {}, scope: LogScope = "core", component = "server") {
    const colors = options.colors ?? resolveLoggerOptions([]).colors;
    const terminalSink: LogSink =
      options.sink ?? ((record) => process.stderr.write(formatLogRecord(record, { colors, level: this.state.level, isTTY: Boolean(process.stderr.isTTY), columns: process.stderr.columns })));
    this.state = {
      operationSequence: 0,
      bannerShown: false,
      level: options.level ?? "INFO",
      colors,
      sink: (record) => {
        terminalSink(record);
        options.fileSink?.(record);
      },
      now: options.now ?? (() => new Date()),
      monotonicNow: options.monotonicNow ?? (() => performance.now()),
    };
    this.scope = scope;
    this.component = component;
  }

  // Children share the output and level settings
  child(scope: LogScope, component: string): Logger {
    const child = new Logger({}, scope, component);
    child.state = this.state;
    return child;
  }

  get level(): LogLevel {
    return this.state.level;
  }

  get colors(): boolean {
    return this.state.colors;
  }

  setLevel(level: LogLevel): void {
    this.state.level = level;
  }

  isEnabled(level: LogLevel): boolean {
    return LOG_LEVELS.indexOf(level) <= LOG_LEVELS.indexOf(this.state.level);
  }

  log(level: LogLevel, message: string, fields: LogFieldsInput = {}): void {
    this.emit(level, message, fields);
  }

  private emit(level: LogLevel, message: string, fields: LogFieldsInput = {}, operation?: TraceOperationDetails): void {
    if (!this.isEnabled(level)) return;
    this.state.sink({
      timestamp: this.state.now(),
      level,
      scope: this.scope,
      component: this.component,
      message,
      fields: typeof fields === "function" ? fields() : fields,
      ...(operation ? { operation } : {}),
    });
  }

  traceStart(message: string, fields?: LogFieldsInput): TraceOperation {
    const id = ++this.state.operationSequence;
    const startedAt = this.state.monotonicNow();
    let finished = false;
    this.emit("TRACE", message, fields, { id, phase: "start" });
    const finish = (phase: "end" | "failed", level: LogLevel, details?: LogFieldsInput) => {
      if (finished) return;
      finished = true;
      this.emit(level, message, details, { id, phase, durationMs: Math.max(0, Math.round(this.state.monotonicNow() - startedAt)) });
    };
    return {
      id,
      end: (details) => finish("end", "TRACE", details),
      fail: (error, level = "WARN", details) => finish("failed", level, () => ({ ...(typeof details === "function" ? details() : details), error })),
    };
  }

  traceIn(message: string, fields?: LogFieldsInput): void {
    this.trace(`← ${message}`, fields);
  }

  traceOut(message: string, fields?: LogFieldsInput): void {
    this.trace(`→ ${message}`, fields);
  }

  separator(message: string, level: LogLevel = "INFO"): void {
    if (!this.isEnabled(level)) return;
    this.state.sink({ kind: "separator", timestamp: this.state.now(), level, scope: this.scope, component: this.component, message, fields: {} });
  }

  startupBanner(info: Omit<StartupBannerInfo, "level">): void {
    if (this.state.bannerShown) return;
    this.state.bannerShown = true;
    const banner = { ...info, level: this.level };
    if (!process.stderr.isTTY) {
      this.info("WhistleIRC server started", banner);
      return;
    }
    this.state.sink({ kind: "banner", banner, timestamp: this.state.now(), level: "INFO", scope: this.scope, component: this.component, message: "WhistleIRC server started", fields: {} });
  }

  critical(message: string, fields?: LogFieldsInput): void {
    this.log("CRITICAL", message, fields);
  }

  error(message: string, fields?: LogFieldsInput): void {
    this.log("ERROR", message, fields);
  }

  warn(message: string, fields?: LogFieldsInput): void {
    this.log("WARN", message, fields);
  }

  info(message: string, fields?: LogFieldsInput): void {
    this.log("INFO", message, fields);
  }

  debug(message: string, fields?: LogFieldsInput): void {
    this.log("DEBUG", message, fields);
  }

  trace(message: string, fields?: LogFieldsInput): void {
    this.log("TRACE", message, fields);
  }
}

export const logger = new Logger({ ...resolveLoggerOptions(), fileSink: createRuntimeFileSink(resolveFileLoggingOptions()) });
