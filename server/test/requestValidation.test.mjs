import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

// Run the real validation/dispatch code without starting index.ts's servers,
// restoring credentials or opening a browser.
const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const validation = source.slice(source.indexOf("function isNonEmptyString"), source.indexOf("function sendUpdateError"));
const dispatch = source.slice(source.indexOf("function handleClientMessage"), source.indexOf('webSocketServer.on("connection"'));
const replies = [];
const context = vm.createContext({ sendJson: (_client, reply) => replies.push(JSON.parse(JSON.stringify(reply))) });
vm.runInContext(ts.transpileModule(validation + dispatch, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
const validate = context.validateMessage;

await test("invalid requests produce correlated errors before dispatch", () => {
  const invalid = [
    { type: "lazer_join_room", room_id: 0 },
    { type: "lazer_add_playlist_item", ruleset_id: 0, beatmap_id: 1 },
    { type: "lazer_add_playlist_item", room_id: 1, ruleset_id: 0, beatmap_id: 1, freestyle: "yes" },
    { type: "lazer_make_room", ruleset_id: 4, beatmap_id: 1, name: "Room" },
    { type: "lazer_roll", room_id: 1, max: 1e20 },
    { type: "lazer_edit_playlist_item", room_id: 1, playlist_item_id: 2, required_mods: [null] },
    { type: "lazer_edit_current_playlist_item", room_id: 1, allowed_mods: [{ acronym: "HD", settings: [] }] },
    { type: "lazer_add_playlist_item", room_id: 1, ruleset_id: 0, beatmap_id: 1, required_mods: null },
    { type: "lazer_set_lock_state", room_id: 1, locked: 1 },
    { type: "unknown_command" },
  ];
  for (const message of invalid) {
    assert.ok(validate(message), JSON.stringify(message));
    context.handleClientMessage({}, message);
    const reply = replies.pop();
    assert.equal(reply.type, "error");
    assert.equal(reply.request, message.type);
    assert.ok(reply.message);
  }
});

await test("unidentifiable messages still receive a useful error", () => {
  for (const message of [null, [], {}, { type: 42 }]) {
    context.handleClientMessage({}, message);
    const reply = replies.pop();
    assert.equal(reply.type, "error");
    assert.equal(reply.request, undefined);
    assert.ok(reply.message);
  }
});

await test("valid fields and edit nulls remain supported", () => {
  const valid = [
    { type: "lazer_add_playlist_item", room_id: 1, ruleset_id: 3, beatmap_id: 2, freestyle: false, required_mods: [{ acronym: "DT", settings: { speed_change: 1.2 } }] },
    { type: "lazer_edit_current_playlist_item", room_id: 1, ruleset_id: null, beatmap_id: null, freestyle: null, required_mods: null },
    { type: "lazer_change_room_settings", room_id: 1, match_type: null, max_participants: 0 },
    { type: "lazer_move_user", room_id: 1, user_id: 2, slot: 0, team: null },
    { type: "lazer_start_match", room_id: 1, countdown: 0 },
  ];
  for (const message of valid) assert.equal(validate(message), null, JSON.stringify(message));
});
