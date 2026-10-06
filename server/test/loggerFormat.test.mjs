import test from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import stringWidth from "string-width";
import { formatLogRecord } from "../src/loggerFormat.ts";

const record = { timestamp: new Date(2026, 9, 6, 12, 35, 10, 87), level: "DEBUG", scope: "stable", component: "irc", message: "Connected", fields: {} };
const render = (changes = {}, options = {}) => formatLogRecord({ ...record, ...changes }, { colors: false, isTTY: true, columns: 80, ...options });

test("banner includes runtime details and brand colors without changing layout", () => {
  const banner = { version: "0.4.0-alpha", url: "http://localhost:3000", nodeVersion: "v24.0.0", os: "Linux 6.10", arch: "x64", level: "WARN" };
  const plain = render({ kind: "banner", banner });
  assert.equal(plain, "┃ WhistleIRC v0.4.0-alpha\n┃ Web UI  http://localhost:3000\n┃ Node.js v24.0.0\n┃ OS      Linux 6.10 / x64\n┃ Logging WARN\n");
  const colored = render({ kind: "banner", banner }, { colors: true });
  assert.equal(stripVTControlCharacters(colored), plain);
  assert.ok(colored.includes("\u001b[1;38;5;183mW"));
  assert.ok(colored.includes("\u001b[1;37mIRC"));
  assert.ok(colored.includes("\u001b[32mNode.js"));
  for (const columns of [12, 30]) {
    for (const line of render({ kind: "banner", banner }, { columns }).trimEnd().split("\n")) assert.ok(stringWidth(line) <= columns);
  }
});

test("separators fill terminal width and become plain messages outside TTY", () => {
  const output = render({ kind: "separator", message: "Starting session" });
  assert.equal(stringWidth(output.trimEnd()), 80);
  assert.ok(output.includes("┃ ── Starting session ─"));
  const plain = render({ kind: "separator", message: "Starting session" }, { isTTY: false });
  assert.ok(plain.endsWith("┃ Starting session\n"));
  assert.ok(!plain.includes("─"));
});

test("normal logs use the chosen prefix and one separator", () => {
  assert.equal(render(), "[12:35:10.087] ■ DEBUG    stable/irc       ┃ Connected\n");
});

test("word wrapping preserves words and aligns continuation separators", () => {
  const message = "This is a test for a very long string handling ".repeat(5).trim();
  const lines = render({ message }).trimEnd().split("\n");
  assert.ok(lines.length > 1);
  const position = lines[0].indexOf("┃");
  for (const line of lines) {
    assert.equal(line.indexOf("┃"), position);
    assert.ok(stringWidth(line) <= 80);
  }
  assert.equal(lines.map((line) => line.split("┃ ")[1]).join(" "), message);
});

test("explicit newlines and stack indentation are preserved", () => {
  const lines = render({ message: "Failed\n  at handler\n\nCause" }).trimEnd().split("\n");
  assert.deepEqual(
    lines.map((line) => line.split("┃ ")[1]),
    ["Failed", "  at handler", "", "Cause"],
  );
});

test("oversized words wrap without breaking graphemes", () => {
  const message = "界👩‍💻é".repeat(30);
  const lines = render({ message }).trimEnd().split("\n");
  const parts = lines.map((line) => line.split("┃ ")[1]);
  assert.equal(parts.join(""), message);
  for (const line of lines) assert.ok(stringWidth(line) <= 80);
  for (const part of parts) assert.ok(!part.startsWith("\u200d") && !part.startsWith("\u0301"));
});

test("critical frames fill the terminal and wrap content inside borders", () => {
  for (const columns of [30, 80, 140]) {
    const lines = render({ level: "CRITICAL", message: "HTTP server failed to start " + "long message ".repeat(30) }, { columns })
      .trimEnd()
      .split("\n");
    assert.ok(lines[0].startsWith("┏"));
    assert.ok(lines.at(-1).endsWith("┛"));
    for (const line of lines) assert.equal(stringWidth(line), columns);
    for (const line of lines.slice(1, -1)) assert.ok(line.startsWith("┃ ") && line.endsWith(" ┃"));
  }
});

test("small terminals shorten prefixes and omit critical frames", () => {
  for (const columns of [4, 12, 20, 29, 50]) {
    const lines = render({ level: "CRITICAL", message: "Long message for a small terminal" }, { columns }).trimEnd().split("\n");
    if (columns < 30) assert.ok(!lines[0].startsWith("┏"));
    for (const line of lines) assert.ok(stringWidth(line) <= columns);
  }
});

test("non-TTY output has no colors, automatic wrapping or frames", () => {
  const message = "long message ".repeat(50);
  const output = render({ level: "CRITICAL", message }, { isTTY: false, colors: true, columns: 30 });
  assert.equal(output, stripVTControlCharacters(output));
  assert.equal(output.split("\n").length, 2);
  assert.ok(output.includes(message));
  assert.ok(!output.includes("┏"));
});

test("coloring does not change layout and payload controls cannot inject ANSI", () => {
  const message = "\u001b[31m" + "Long colored message ".repeat(20) + "\u001b[0m";
  const plain = render({ message });
  const colored = render({ message }, { colors: true });
  assert.equal(stripVTControlCharacters(colored), plain);
  assert.ok(colored.includes("\u001b["));
  assert.equal(plain, stripVTControlCharacters(plain));
});
