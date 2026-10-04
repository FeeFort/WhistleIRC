import assert from "node:assert/strict";
import { test } from "node:test";
import { HubConnectionBuilder, HubConnectionState } from "@microsoft/signalr";
import { connectToRefereeHub } from "../src/lazer/refereeHubClient.ts";
import { roomManager } from "../src/lazer/roomManager.ts";

const snapshot = (roomId, name = "Fresh") => ({
  room_id: roomId,
  chat_channel_id: roomId + 100,
  name,
  password: "",
  max_participants: 4,
  state: { type: "head_to_head", locked: false, slots: null },
  playlist: [],
  players: [],
  referees: [],
});

await test("room synchronization", async (t) => {
  let invoke;
  let reconnect;
  const hub = {
    state: HubConnectionState.Connected,
    on() {},
    onreconnecting() {},
    onclose() {},
    onreconnected(callback) {
      reconnect = callback;
    },
    async start() {},
    invoke(...args) {
      return invoke(...args);
    },
  };
  t.mock.method(HubConnectionBuilder.prototype, "build", () => hub);
  await connectToRefereeHub(
    () => {},
    () => roomManager.resync(),
  );
  const updates = [];
  const removed = [];
  roomManager.setListeners(
    (room) => updates.push(structuredClone(room)),
    (id) => removed.push(id),
  );

  await t.test("reconnect refreshes existing rooms, adds new rooms and removes missing rooms", async () => {
    roomManager.trackRoom(snapshot(1, "Stale"));
    roomManager.trackRoom(snapshot(2));
    updates.length = 0;
    const calls = [];
    invoke = async (method, roomId) => {
      calls.push([method, roomId]);
      return method === "ListRooms" ? { room_ids: [1, 3] } : snapshot(roomId);
    };
    await reconnect();
    assert.deepEqual(calls, [
      ["ListRooms", undefined],
      ["JoinRoom", 1],
      ["JoinRoom", 3],
    ]);
    assert.equal(roomManager.getRoom(1).name, "Fresh");
    assert.equal(roomManager.getRoom(2), undefined);
    assert.deepEqual(removed, [2]);
    assert.deepEqual(
      updates.map((room) => room.room_id),
      [1, 3],
    );
  });

  await t.test("concurrent synchronizations share one operation and buffered events survive snapshots", async () => {
    const item = { id: 7, ruleset_id: 0, beatmap_id: 8, required_mods: [], allowed_mods: [], freestyle: false, was_played: false, order: 0 };
    let resolveJoin;
    invoke = async (method) =>
      method === "ListRooms"
        ? { room_ids: [1] }
        : new Promise((resolve) => {
            resolveJoin = resolve;
          });
    const first = roomManager.resync();
    assert.equal(roomManager.resync(), first);
    await new Promise((resolve) => setImmediate(resolve));
    roomManager.handleHubEvent("PlaylistItemAdded", { room_id: 1, playlist_item: item });
    roomManager.handleHubEvent("UserStatusChanged", { room_id: 1, user_id: 42, status: "ready" });
    roomManager.handleHubEvent("RoomSettingsChanged", { room_id: 1, name: "Live", password: "", type: "head_to_head", max_participants: 6 });
    const fresh = snapshot(1);
    fresh.playlist = [item];
    resolveJoin(fresh);
    await first;
    assert.equal(roomManager.getRoom(1).playlist.length, 1);
    assert.equal(roomManager.getRoom(1).players[0].status, "ready");
    assert.equal(roomManager.getRoom(1).name, "Live");
  });

  await t.test("a room failure is reported without preventing other room updates; retry works", async () => {
    invoke = async (method, roomId) => {
      if (method === "ListRooms") return { room_ids: [1, 4] };
      if (roomId === 1) throw new Error("Join failed");
      return snapshot(roomId);
    };
    await assert.rejects(roomManager.resync(), AggregateError);
    assert.equal(roomManager.getRoom(1).name, "Live");
    assert.equal(roomManager.getRoom(4).name, "Fresh");
    invoke = async (method, roomId) => (method === "ListRooms" ? { room_ids: [1, 4] } : snapshot(roomId, "Retried"));
    await roomManager.resync();
    assert.equal(roomManager.getRoom(1).name, "Retried");
  });

  await t.test("leaving during refresh prevents a late snapshot from restoring the room", async () => {
    let resolveJoin;
    invoke = async (method) =>
      method === "ListRooms"
        ? { room_ids: [1, 4] }
        : new Promise((resolve) => {
            resolveJoin = resolve;
          });
    const syncing = roomManager.resync();
    await new Promise((resolve) => setImmediate(resolve));
    roomManager.removeRoom(1);
    resolveJoin(snapshot(1));
    await new Promise((resolve) => setImmediate(resolve));
    resolveJoin(snapshot(4));
    await syncing;
    assert.equal(roomManager.getRoom(1), undefined);
    assert.equal(roomManager.getRoom(4).name, "Fresh");
  });

  await t.test("ListRooms failure preserves tracked rooms and reaches reconnect error handling", async () => {
    const errors = [];
    const log = t.mock.method(console, "error", (message) => errors.push(message));
    invoke = async () => {
      throw new Error("List failed");
    };
    await assert.rejects(roomManager.resync(), /List failed/);
    await reconnect();
    assert.equal(roomManager.getAllRooms().length, 1);
    assert.match(errors[0], /Sync after reconnect failed: List failed/);
    log.mock.restore();
  });
});
