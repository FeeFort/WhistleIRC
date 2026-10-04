import * as signalR from "@microsoft/signalr";
import { getAccessToken } from "../auth/auth.js";
import { config } from "../config.js";
import { HubEventHandler, ResyncHandler, HubEventType, LazerHubEvent, HubEventPayloads } from "../types.js";

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
      return id(value.user_id) && ["idle", "ready", "playing", "finished_play", "spectating"].includes(String(value.status));
    case "UserModsChanged":
      return id(value.user_id) && mods(value.mods);
    case "UserStyleChanged":
      return id(value.user_id) && nullableId(value.beatmap_id) && (value.ruleset_id === null || (integer(value.ruleset_id) && Number(value.ruleset_id) <= 3));
    case "UserTeamChanged":
      return id(value.user_id) && (value.team === null || team(value.team));
    case "CountdownStarted":
    case "CountdownStopped":
      return integer(value.countdown_id) && ["match_start", "server_shutting_down"].includes(String(value.type)) && (eventType === "CountdownStopped" || integer(value.seconds));
    case "MatchStarted":
      return (
        id(value.playlist_item_id) &&
        matchType(value.type) &&
        (value.teams === null || (object(value.teams) && Object.entries(value.teams).every(([key, v]) => id(Number(key)) && team(v)))) &&
        (value.slots === null || (object(value.slots) && Object.entries(value.slots).every(([key, v]) => id(Number(key)) && integer(v))))
      );
  }
}

let connection: signalR.HubConnection | null = null;

export async function connectToRefereeHub(onEvent: HubEventHandler, onResync: ResyncHandler): Promise<signalR.HubConnection> {
  const hub = new signalR.HubConnectionBuilder()
    .withUrl(new URL("/referee", config.spectatorServerUrl).toString(), {
      accessTokenFactory: () => getAccessToken(),
    })
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Warning)
    .build();

  for (const eventName of CLIENT_EVENTS) {
    hub.on(eventName, (payload: unknown) => {
      if (!isHubPayload(eventName, payload)) {
        console.warn(`[refereeHub] Invalid ${eventName} payload, ignoring`);
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
    console.warn(`[refereeHub] Reconnecting: ${error?.message ?? "unknown reason"}`);
  });

  hub.onreconnected(async () => {
    console.log("[refereeHub] Reconnected — syncing rooms list");
    try {
      await onResync();
    } catch (error) {
      console.error(`[refereeHub] Sync after reconnect failed: ${(error as Error).message}`);
    }
  });

  hub.onclose((error) => {
    console.error(`[refereeHub] Connection closed: ${error?.message ?? "no error"}`);
  });

  await hub.start();
  connection = hub;
  return hub;
}

export async function invokeHub<T = unknown>(methodName: string, ...args: unknown[]): Promise<T> {
  if (!connection || connection.state !== signalR.HubConnectionState.Connected) {
    throw new Error(`Cannot invoke ${methodName}: referee hub is not connected.`);
  }
  return connection.invoke<T>(methodName, ...args);
}

export function isHubConnected(): boolean {
  return connection?.state === signalR.HubConnectionState.Connected;
}
