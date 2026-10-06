import assert from "node:assert/strict";
import { test } from "node:test";
import { roomManager } from "../src/lazer/roomManager.ts";
import { handleLazerJoinRoom, handleLazerMakeRoom, handleLazerLoadChat } from "../src/lazer/handlers.ts";

const room = { room_id: 1, chat_channel_id: 2, name: "Room", players: [], referees: [], playlist: [] };

await test("room success is acknowledged before chat and chat failure does not fail the room command", async (t) => {
  t.mock.method(roomManager, "joinRoom", async () => room);
  for (const [handler, type] of [
    [handleLazerJoinRoom, "lazer_join_room"],
    [handleLazerMakeRoom, "lazer_make_room"],
  ]) {
    const replies = [];
    const client = { readyState: 1, send: (text) => replies.push(JSON.parse(text)) };
    const load = t.mock.method(roomManager, "loadChat", async () => {
      throw Object.assign(new Error("History unavailable"), { stage: "history", code: "REQUEST_TIMEOUT" });
    });
    await handler(client, { type, room_id: 1, requestId: "request-1" });
    assert.equal(replies[0].type, "ack");
    assert.equal(replies[0].received, type);
    assert.equal(replies[0].requestId, "request-1");
    assert.deepEqual(
      replies.slice(1).map((reply) => reply.state),
      ["loading", "failed"],
    );
    assert.equal(replies.at(-1).stage, "history");
    assert.equal(replies.at(-1).code, "REQUEST_TIMEOUT");
    assert.equal(
      replies.some((reply) => reply.type === "error"),
      false,
    );
    load.mock.restore();
  }
});

await test("chat-only reload sends history and does not rejoin the room", async (t) => {
  t.mock.method(roomManager, "joinRoom", () => {
    throw new Error("Must not rejoin");
  });
  t.mock.method(roomManager, "loadChat", async () => [{ message_id: 5 }]);
  const replies = [];
  const client = { readyState: 1, send: (text) => replies.push(JSON.parse(text)) };
  await handleLazerLoadChat(client, { type: "lazer_load_chat", room_id: 1, requestId: "reload" });
  assert.deepEqual(
    replies.map((reply) => reply.type),
    ["lazer_chat_state", "lazer_chat_history", "lazer_chat_state", "ack"],
  );
  assert.equal(replies[2].state, "ready");
  assert.ok(replies.every((reply) => reply.requestId === "reload"));
});

await test("explicit chat reload failure returns a correlated error", async (t) => {
  t.mock.method(roomManager, "loadChat", async () => {
    throw Object.assign(new Error("No channel"), { stage: "channel" });
  });
  const replies = [];
  const client = { readyState: 1, send: (text) => replies.push(JSON.parse(text)) };
  await handleLazerLoadChat(client, { type: "lazer_load_chat", room_id: 1, requestId: "reload" });
  assert.equal(replies[1].state, "failed");
  assert.equal(replies[1].stage, "channel");
  assert.equal(replies[2].request, "lazer_load_chat");
  assert.equal(replies[2].requestId, "reload");
});

await test("pending chat loads are shared and session reset releases them", async () => {
  roomManager.trackRoom(room);
  const first = roomManager.loadChat(1);
  const second = roomManager.loadChat(1);
  assert.equal(first, second);
  const rejected = assert.rejects(first, (error) => error.code === "SESSION_ENDED");
  roomManager.reset();
  await rejected;
  await assert.rejects(roomManager.loadChat(1), /not tracked/);
});

await test("late chat errors from an ended session do not emit state or history", async (t) => {
  t.mock.method(roomManager, "loadChat", async () => {
    throw Object.assign(new Error("Ended"), { code: "SESSION_ENDED" });
  });
  const replies = [];
  const client = { readyState: 1, send: (text) => replies.push(JSON.parse(text)) };
  await handleLazerLoadChat(client, { type: "lazer_load_chat", room_id: 1 }, false);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].state, "loading");
});
