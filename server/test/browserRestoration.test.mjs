import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

await test("new browser gets cached rooms without hub requests", () => {
  const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const block = source.slice(source.indexOf('webSocketServer.on("connection"'), source.indexOf("httpServer.listen("));
  const rooms = [{ room_id: 1 }, { room_id: 2 }];
  const replies = [];
  let connect;
  const context = vm.createContext({
    webSocketServer: {
      on: (_name, callback) => {
        connect = callback;
      },
    },
    addClient() {},
    sendJson: (_client, reply) => replies.push(reply),
    lazerConnectionState: { type: "lazer_connection_state", state: "connected" },
    lazerSyncState: { type: "lazer_sync_state", state: "synced" },
    roomManager: { getAllRooms: () => rooms },
    banchoConnection: { sendStatus() {}, lobbyStates: new Map() },
  });
  vm.runInContext(ts.transpileModule(block, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  connect({ on() {} });
  assert.equal(replies.filter((reply) => reply.type === "lazer_room_state").length, 2);
  assert.deepEqual(Array.from(replies.at(-1).roomIds), [1, 2]);
  assert.equal(replies.at(-1).type, "lazer_rooms");
});

await test("frontend restoration merges history with live messages instead of rejoining", () => {
  const source = readFileSync(new URL("../../client/src/App.vue", import.meta.url), "utf8");
  assert.equal(source.includes("listLazerRooms"), false);
  assert.equal(source.includes('event.received === "lazer_list_rooms"'), false);
  const start = source.indexOf("function lazerChatId(");
  const end = source.indexOf("function appendLazerChatMessage(", start);
  const channelMessages = {
    "lazer:1": [
      { id: 2, text: "Live" },
      { id: "system-1", text: "Match started" },
    ],
  };
  const context = vm.createContext({ channelMessages, unreadChats: {} });
  vm.runInContext(source.slice(start, end), context);
  const history = [
    { message_id: 1, content: "Earlier" },
    { message_id: 2, content: "Live" },
  ];
  context.appendLazerChatHistory(1, history);
  context.appendLazerChatHistory(1, history);
  assert.deepEqual(
    Array.from(channelMessages["lazer:1"], (message) => message.id),
    [1, 2, "system-1"],
  );
});
