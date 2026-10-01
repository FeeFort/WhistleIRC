import * as signalR from "@microsoft/signalr";
import { getAccessToken } from "../auth/auth.js";
import { config } from "../config.js";
import { HubEventHandler, ResyncHandler } from "../types.js";

// full list of referee hub events that can be invoked by the server
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
] as const;

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
    hub.on(eventName, (payload: unknown) => onEvent(eventName, payload));
  }

  hub.onreconnecting((error) => {
    console.warn(`[refereeHub] Reconnecting: ${error?.message ?? "unknown reason"}`);
  });

  hub.onreconnected(async () => {
    console.log("[refereeHub] Reconnected — syncing rooms list");
    try {
      const rooms = await hub.invoke("ListRooms");
      onResync(rooms);
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
