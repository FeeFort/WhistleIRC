import assert from "node:assert/strict";
import { test } from "node:test";
import { HubConnectionBuilder, HubConnectionState } from "@microsoft/signalr";
import { connectToRefereeHub, isHubPayload } from "../src/lazer/refereeHubClient.ts";
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
  let reconnecting;
  let closed;
  const statuses = [];
  const listeners = new Map();
  const forwarded = [];
  const hub = {
    state: HubConnectionState.Connected,
    on(name, callback) {
      listeners.set(name, callback);
    },
    onreconnecting(callback) {
      reconnecting = callback;
    },
    onclose(callback) {
      closed = callback;
    },
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
    (event) => forwarded.push(event),
    () => roomManager.resync(),
    (event) => statuses.push(event),
  );
  const updates = [];
  const removed = [];
  roomManager.setListeners(
    (room) => updates.push(structuredClone(room)),
    (id) => removed.push(id),
    (event) => statuses.push(event),
  );

  await t.test("connection state reports initial connection, reconnect and closure", () => {
    assert.deepEqual(
      statuses.map((event) => event.state),
      ["connecting", "connected"],
    );
    reconnecting(new Error("Network lost"));
    assert.deepEqual(statuses.at(-1), { type: "lazer_connection_state", state: "reconnecting", reason: "Network lost" });
    closed(new Error("Retries exhausted"));
    assert.equal(statuses.at(-1).state, "disconnected");
    assert.equal(statuses.at(-1).reason, "Retries exhausted");
  });

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
    assert.equal(statuses.at(-1).state, "synced");
    assert.deepEqual(
      statuses.slice(-3).map((event) => event.state),
      ["connected", "syncing", "synced"],
    );
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
    assert.equal(statuses.at(-1).state, "failed");
    assert.equal(statuses.at(-1).scope, "partial");
    assert.deepEqual(statuses.at(-1).failedRoomIds, [1]);
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
    await assert.rejects(syncing, AggregateError);
    assert.equal(roomManager.getRoom(1), undefined);
    assert.equal(roomManager.getRoom(4).name, "Fresh");
  });

  await t.test("user joins share one request, preserve ordered updates and release failures", async () => {
    let resolveJoin;
    let calls = 0;
    invoke = () => {
      calls++;
      return new Promise((resolve) => {
        resolveJoin = resolve;
      });
    };
    const first = roomManager.joinRoom(10);
    const second = roomManager.joinRoom(10);
    assert.equal(calls, 1);
    roomManager.handleHubEvent("UserJoined", { room_id: 10, user_id: 42 });
    roomManager.handleHubEvent("UserLeft", { room_id: 10, user_id: 42 });
    roomManager.handleHubEvent("UserJoined", { room_id: 10, user_id: 43 });
    roomManager.handleHubEvent("UserTeamChanged", { room_id: 10, user_id: 43, team: "red" });
    roomManager.handleHubEvent("RefereeRemoved", { room_id: 10, user_id: 44 });
    const fresh = snapshot(10);
    fresh.referees = [{ user_id: 44 }];
    resolveJoin(fresh);
    assert.equal(await first, await second);
    assert.deepEqual(
      fresh.players.map((p) => p.user_id),
      [43],
    );
    assert.equal(fresh.players[0].team, "red");
    assert.deepEqual(fresh.referees, []);
    invoke = async () => {
      throw new Error("Denied");
    };
    await assert.rejects(roomManager.joinRoom(11), /Denied/);
    invoke = async () => snapshot(11);
    await roomManager.joinRoom(11);
    roomManager.removeRoom(10);
    roomManager.removeRoom(11);
  });

  await t.test("creation captures early events only for the returned room", async () => {
    let resolveMake;
    invoke = () =>
      new Promise((resolve) => {
        resolveMake = resolve;
      });
    const creating = roomManager.joinRoom(null, { name: "New", ruleset_id: 0, beatmap_id: 1 });
    roomManager.handleHubEvent("UserStatusChanged", { room_id: 12, user_id: 42, status: "ready" });
    roomManager.handleHubEvent("UserJoined", { room_id: 99, user_id: 99 });
    roomManager.handleHubEvent("RefereeAdded", { room_id: 12, user_id: 44 });
    roomManager.handleHubEvent("RefereeRemoved", { room_id: 12, user_id: 44 });
    resolveMake(snapshot(12));
    const room = await creating;
    assert.equal(room.players[0].status, "ready");
    assert.deepEqual(room.referees, []);
    assert.equal(roomManager.getRoom(99), undefined);
    roomManager.removeRoom(12);
  });

  await t.test("unknown rooms are rejected while pending joins and tracked rooms are accepted", async () => {
    const warnings = t.mock.method(console, "warn", () => {});
    assert.equal(roomManager.handleHubEvent("RollCompleted", { room_id: 99, user_id: 1, max: 100, result: 2 }), false);
    assert.equal(roomManager.handleHubEvent("UserJoined", { room_id: 99, user_id: 1 }), false);
    assert.equal(roomManager.getRoom(99), undefined);
    let resolveJoin;
    invoke = () =>
      new Promise((resolve) => {
        resolveJoin = resolve;
      });
    const joining = roomManager.joinRoom(13);
    assert.equal(roomManager.handleHubEvent("UserJoined", { room_id: 13, user_id: 42 }), true);
    resolveJoin(snapshot(13));
    await joining;
    assert.equal(roomManager.getRoom(13).players[0].user_id, 42);
    assert.equal(roomManager.handleHubEvent("MatchCompleted", { room_id: 13, playlist_item_id: 1 }), true);
    roomManager.removeRoom(13);
    warnings.mock.restore();
  });

  await t.test("automatic join failure is reported as a room error", async () => {
    const log = t.mock.method(console, "error", () => {});
    invoke = async () => {
      throw new Error("No access");
    };
    roomManager.handleHubEvent("RefereeAdded", { room_id: 77, user_id: 1 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(statuses.at(-1), { type: "lazer_room_error", roomId: 77, operation: "join", message: "No access" });
    log.mock.restore();
  });

  await t.test("SignalR boundary drops invalid events before forwarding", () => {
    const warnings = t.mock.method(console, "warn", () => {});
    listeners.get("UserJoined")(null);
    listeners.get("UserJoined")({ room_id: 1, user_id: "bad" });
    assert.equal(forwarded.length, 0);
    listeners.get("UserJoined")({ room_id: 1, user_id: 2, extra: true });
    assert.deepEqual(forwarded[0], { type: "lazer_event", eventType: "UserJoined", roomId: 1, payload: { room_id: 1, user_id: 2, extra: true } });
    warnings.mock.restore();
  });

  await t.test("invalid event structures are rejected, including nested values", () => {
    for (const value of [null, [], {}, { room_id: "1", user_id: 2 }, { room_id: 1, user_id: NaN }]) {
      assert.equal(isHubPayload("UserJoined", value), false);
    }
    assert.equal(isHubPayload("UserJoined", { room_id: 1, user_id: 2 }), true);
    assert.equal(isHubPayload("UserStatusChanged", { room_id: 1, user_id: 2, status: "unknown" }), false);
    assert.equal(isHubPayload("UserModsChanged", { room_id: 1, user_id: 2, mods: [{ acronym: "HD", settings: [] }] }), false);
    assert.equal(isHubPayload("UserModsChanged", { room_id: 1, user_id: 2, mods: [{ acronym: "HD" }] }), true);
    assert.equal(isHubPayload("MatchStateChanged", { room_id: 1, state: { type: "head_to_head", locked: false, slots: [null, "2"] } }), false);
    assert.equal(isHubPayload("PlaylistItemAdded", { room_id: 1, playlist_item: { id: 2 } }), false);
    assert.equal(isHubPayload("RollCompleted", { room_id: 1, user_id: 2, max: 100, result: 101 }), false);
  });

  await t.test("ListRooms failure preserves tracked rooms and reaches reconnect error handling", async () => {
    const errors = [];
    const log = t.mock.method(console, "error", (message) => errors.push(message));
    invoke = async () => {
      throw new Error("List failed");
    };
    await assert.rejects(roomManager.resync(), /List failed/);
    assert.equal(statuses.at(-1).scope, "all");
    assert.equal(statuses.at(-1).message, "List failed");
    await reconnect();
    assert.equal(roomManager.getAllRooms().length, 1);
    assert.match(errors[0], /Sync after reconnect failed: List failed/);
    log.mock.restore();
  });
});
