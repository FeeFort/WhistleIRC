import { hubRateLimiter, rateLimitError } from "../rateLimiter.js";
import * as signalR from "@microsoft/signalr";
import { getAccessToken } from "../auth/auth.js";
import { config } from "../config.js";
import { logger } from "../logger/logger.js";
import { HubEventHandler, ResyncHandler, HubEventType, LazerHubEvent, HubEventPayloads, LazerStatusHandler } from "../types.js";

const log = logger.child("lazer", "refereeHub");

// Full list of referee hub events that can be invoked by the server
const CLIENT_EVENTS = [
  "UserJoined",
  "UserLeft",
  "UserKicked",
  "UserBanned",
  "RefereeAdded",
  "RefereeRemoved",
  "RefereeInvited",
  "RoomSettingsChanged",
  "MatchStateChanged",
  "PlaylistItemAdded",
  "PlaylistItemChanged",
  "PlaylistItemRemoved",
  "RollCompleted",
  "UserStatusChanged",
  "UserModsChanged",
  "UserStyleChanged",
  "UserTeamChanged",
  "CountdownStarted",
  "CountdownStopped",
  "MatchStarted",
  "MatchAborted",
  "MatchCompleted",
] as const satisfies readonly HubEventType[];

function isQueueMode(value: unknown): boolean {
  return value === "HostOnly" || value === "AllPlayers" || value === "AllPlayersRoundRobin";
}

export function isHubPayload(eventType: HubEventType, value: unknown): value is HubEventPayloads[HubEventType] {
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  const id = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
  const integer = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
  const nullableId = (v: unknown) => v === null || id(v);
  const matchType = (v: unknown) => v === "head_to_head" || v === "team_versus";
  const team = (v: unknown) => v === "red" || v === "blue";
  const mods = (v: unknown) => Array.isArray(v) && v.every((m) => object(m) && typeof m.acronym === "string" && (m.settings === undefined || object(m.settings)));
  const item = (v: unknown) =>
    object(v) &&
    id(v.id) &&
    integer(v.ruleset_id) &&
    Number(v.ruleset_id) <= 3 &&
    id(v.beatmap_id) &&
    mods(v.required_mods) &&
    mods(v.allowed_mods) &&
    typeof v.freestyle === "boolean" &&
    typeof v.was_played === "boolean" &&
    integer(v.order);
  if (!object(value) || !id(value.room_id)) return false;
  switch (eventType) {
    case "UserJoined":
    case "UserLeft":
    case "RefereeAdded":
    case "RefereeRemoved":
      return id(value.user_id);
    case "UserKicked":
      return id(value.kicked_user_id) && id(value.kicking_user_id);
    case "UserBanned":
      return id(value.banned_user_id) && id(value.banning_user_id);
    case "RefereeInvited":
      return true;
    case "RoomSettingsChanged":
      return (
        typeof value.name === "string" &&
        typeof value.password === "string" &&
        matchType(value.type) &&
        isQueueMode(value.queue_mode) &&
        id(value.playlist_item_id) &&
        (value.max_participants === null || integer(value.max_participants))
      );
    case "MatchStateChanged":
      return (
        object(value.state) &&
        matchType(value.state.type) &&
        typeof value.state.locked === "boolean" &&
        (value.state.slots === null || (Array.isArray(value.state.slots) && value.state.slots.every(nullableId)))
      );
    case "PlaylistItemAdded":
    case "PlaylistItemChanged":
      return item(value.playlist_item);
    case "PlaylistItemRemoved":
    case "MatchAborted":
    case "MatchCompleted":
      return id(value.playlist_item_id);
    case "RollCompleted":
      return id(value.user_id) && id(value.max) && integer(value.result) && Number(value.result) <= Number(value.max);
    case "UserStatusChanged":
      return id(value.user_id) && typeof value.status === "string" && ["idle", "ready", "playing", "finished_play", "spectating"].includes(value.status);
    case "UserModsChanged":
      return id(value.user_id) && mods(value.mods);
    case "UserStyleChanged":
      return id(value.user_id) && nullableId(value.beatmap_id) && (value.ruleset_id === null || (integer(value.ruleset_id) && Number(value.ruleset_id) <= 3));
    case "UserTeamChanged":
      return id(value.user_id) && (value.team === null || team(value.team));
    case "CountdownStarted":
    case "CountdownStopped":
      return (
        integer(value.countdown_id) &&
        typeof value.type === "string" &&
        ["match_start", "server_shutting_down"].includes(value.type) &&
        (eventType === "CountdownStopped" || (typeof value.seconds === "number" && Number.isFinite(value.seconds) && value.seconds >= 0))
      );
    case "MatchStarted":
      return (
        id(value.playlist_item_id) &&
        matchType(value.type) &&
        (value.teams === null || (object(value.teams) && Object.entries(value.teams).every(([key, v]) => id(Number(key)) && team(v)))) &&
        (value.slots === null || (object(value.slots) && Object.entries(value.slots).every(([key, v]) => id(Number(key)) && integer(v))))
      );
  }
}

// Validate snapshots using the same nested contract as incoming hub events.
export function isHubResponse(methodName: string, value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const response = value as Record<string, unknown>;
  const id = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
  if (methodName === "ListRooms") {
    return Array.isArray(response.room_ids) && response.room_ids.every(id) && new Set(response.room_ids).size === response.room_ids.length;
  }
  if (
    !id(response.room_id) ||
    !id(response.chat_channel_id) ||
    typeof response.name !== "string" ||
    typeof response.password !== "string" ||
    !isQueueMode(response.queue_mode) ||
    !Number.isSafeInteger(response.max_participants) ||
    Number(response.max_participants) < 0 ||
    Number(response.max_participants) > 255 ||
    !isHubPayload("MatchStateChanged", { room_id: response.room_id, state: response.state })
  )
    return false;
  if (!Array.isArray(response.playlist) || !Array.isArray(response.players) || !Array.isArray(response.referees)) return false;
  if (!response.playlist.every((item) => isHubPayload("PlaylistItemAdded", { room_id: response.room_id, playlist_item: item }))) return false;
  if (!response.referees.every((referee) => referee && typeof referee === "object" && !Array.isArray(referee) && isHubPayload("RefereeAdded", { ...referee, room_id: response.room_id }))) return false;
  if (
    !response.players.every((player) => {
      if (!player || typeof player !== "object" || Array.isArray(player) || !player.style || typeof player.style !== "object" || Array.isArray(player.style)) return false;
      return (
        isHubPayload("UserStatusChanged", { ...player, room_id: response.room_id }) &&
        isHubPayload("UserModsChanged", { ...player, room_id: response.room_id }) &&
        isHubPayload("UserTeamChanged", { ...player, room_id: response.room_id }) &&
        isHubPayload("UserStyleChanged", { ...player.style, user_id: player.user_id, room_id: response.room_id })
      );
    })
  )
    return false;
  return (
    new Set(response.playlist.map((item) => item.id)).size === response.playlist.length &&
    new Set(response.players.map((player) => player.user_id)).size === response.players.length &&
    new Set(response.referees.map((referee) => referee.user_id)).size === response.referees.length
  );
}

let connection: signalR.HubConnection | null = null;
let connectionGeneration = 0;
let sessionAbort = new AbortController();
let statusHandler: LazerStatusHandler | undefined;

export async function disconnectFromRefereeHub(): Promise<void> {
  sessionAbort.abort();
  sessionAbort = new AbortController();
  ++connectionGeneration;
  const previous = connection;
  connection = null;
  const notify = statusHandler;
  statusHandler = undefined;
  notify?.({ type: "lazer_connection_state", state: "disconnected" });
  if (previous) log.debug("Stopping connection", { session: connectionGeneration - 1, state: previous.state });
  await previous?.stop();
}

export async function connectToRefereeHub(onEvent: HubEventHandler, onResync: ResyncHandler, onStatus?: LazerStatusHandler): Promise<signalR.HubConnection> {
  await disconnectFromRefereeHub();
  const generation = connectionGeneration;
  statusHandler = onStatus;
  const hub = new signalR.HubConnectionBuilder()
    .withUrl(new URL("/referee", config.spectatorServerUrl).toString(), {
      accessTokenFactory: () => getAccessToken(),
    })
    .withAutomaticReconnect()
    .configureLogging({
      log: (level, message) => {
        // Keep protocol payload logging in the application
        if (level >= signalR.LogLevel.Warning && level < signalR.LogLevel.None) log.log(level === signalR.LogLevel.Critical ? "ERROR" : "WARN", message);
      },
    })
    .build();

  connection = hub;
  for (const eventName of CLIENT_EVENTS) {
    hub.on(eventName, (payload: unknown) => {
      if (generation !== connectionGeneration) {
        log.trace("Ignored stale event", { session: generation, eventName });
        return;
      }
      log.traceIn(eventName, () => ({ session: generation, payload: JSON.stringify(payload, (key, value) => (/password|token|secret|authorization/i.test(key) ? "[redacted]" : value)) }));
      if (!isHubPayload(eventName, payload)) {
        log.warn("Invalid event payload, ignoring", { eventName });
        return;
      }
      onEvent({
        type: "lazer_event",
        eventType: eventName,
        roomId: (payload as LazerHubEvent["payload"]).room_id,
        payload,
      } as LazerHubEvent);
    });
  }

  hub.onreconnecting((error) => {
    if (generation !== connectionGeneration) return;
    sessionAbort.abort();
    sessionAbort = new AbortController();
    onStatus?.({ type: "lazer_connection_state", state: "reconnecting", ...(error ? { reason: error.message } : {}) });
    log.separator(`Reconnecting: ${error?.message ?? "unknown reason"}`, "WARN");
  });

  hub.onreconnected(async () => {
    if (generation !== connectionGeneration) return;
    sessionAbort = new AbortController();
    onStatus?.({ type: "lazer_connection_state", state: "connected" });
    log.separator("Connection restored");
    try {
      await onResync();
    } catch (error) {
      log.warn("Sync after reconnect failed", { error });
    }
  });

  hub.onclose((error) => {
    if (generation !== connectionGeneration) return;
    onStatus?.({ type: "lazer_connection_state", state: "disconnected", ...(error ? { reason: error.message } : {}) });
    sessionAbort.abort();
    if (error) log.error("Connection closed, automatic reconnect stopped", { error });
    else log.info("Connection closed");
  });

  log.info("Connecting", { session: generation, url: new URL("/referee", config.spectatorServerUrl).toString() });
  onStatus?.({ type: "lazer_connection_state", state: "connecting" });
  try {
    await hub.start();
  } catch (error) {
    log.warn("Connection failed", { session: generation, error });
    if (generation === connectionGeneration) onStatus?.({ type: "lazer_connection_state", state: "disconnected", reason: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  if (generation !== connectionGeneration) {
    log.trace("Stale hub result ignored", { generation, currentGeneration: connectionGeneration });
    throw new Error("SignalR session was replaced.");
  }
  log.info("Connected", { session: generation, connectionId: hub.connectionId ?? "unknown" });
  onStatus?.({ type: "lazer_connection_state", state: "connected" });
  return hub;
}

export async function invokeHub<T = unknown>(methodName: string, ...args: unknown[]): Promise<T> {
  const operation = log.traceStart(methodName, () => ({
    session: connectionGeneration,
    args: JSON.stringify(args, (key, value) => (/password|token|secret|authorization/i.test(key) ? "[redacted]" : value)),
  }));
  if (!connection || connection.state !== signalR.HubConnectionState.Connected) {
    const error = new Error(`Cannot invoke ${methodName}: referee hub is not connected.`);
    operation.fail(error, "WARN", { state: connection?.state ?? "absent" });
    throw error;
  }
  const generation = connectionGeneration;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let result: T;
  let release: (() => void) | undefined;
  const hub = connection;
  const signal = sessionAbort.signal;
  try {
    log.trace("Waiting for invocation capacity", { operationId: operation.id, methodName, generation });
    release = await hubRateLimiter.acquire(signal);
    log.trace("Invocation capacity acquired", { operationId: operation.id, methodName });
    if (signal.aborted || generation !== connectionGeneration || hub !== connection || hub.state !== signalR.HubConnectionState.Connected)
      throw rateLimitError("REQUEST_CANCELLED", "SignalR connection changed before the request was sent.");
    result = await Promise.race([
      hub.invoke<T>(methodName, ...args),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Object.assign(new Error(`SignalR request ${methodName} timed out; its outcome may be unknown.`), {
                code: "REQUEST_TIMEOUT",
                outcomeUnknown: methodName !== "ListRooms" && methodName !== "JoinRoom",
              }),
            ),
          config.hubRequestTimeoutMs,
        );
      }),
    ]);
    if (generation !== connectionGeneration) {
      log.trace("Stale hub result ignored", { generation, currentGeneration: connectionGeneration });
      throw new Error("SignalR session was replaced.");
    }
    if (["ListRooms", "JoinRoom", "MakeRoom"].includes(methodName)) {
      if (!isHubResponse(methodName, result) || (methodName === "JoinRoom" && (result as { room_id: number }).room_id !== args[0])) {
        // TODO: Retry safe snapshot reads through the shared exponential backoff policy.
        // Do not repeat MakeRoom: an invalid response may follow successful creation.
        throw Object.assign(new Error(`Invalid ${methodName} response from referee hub.`), {
          code: "INVALID_RESPONSE",
          outcomeUnknown: methodName === "MakeRoom",
        });
      }
    }
    operation.end(() => ({ result: JSON.stringify(result, (key, value) => (/password|token|secret|authorization/i.test(key) ? "[redacted]" : value)) }));
  } catch (error) {
    operation.fail(error, "WARN", { session: generation });
    throw error;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
      log.trace("Invocation timeout cancelled", { operationId: operation.id });
    }
    release?.();
  }
  // TODO: Apply shared exponential backoff retries only where replay is safe.
  // Mutations must not be retried blindly: timeout does not cancel the remote call.
  if (generation !== connectionGeneration) {
    log.trace("Stale hub result ignored", { generation, currentGeneration: connectionGeneration });
    throw new Error("SignalR session was replaced.");
  }
  return result;
}

export function isHubConnected(): boolean {
  return connection?.state === signalR.HubConnectionState.Connected;
}
