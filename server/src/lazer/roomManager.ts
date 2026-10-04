import type {
  RoomJoinedResponse as RoomState,
  RoomJoinedResponse,
  HubEventType,
  HubEventPayloads,
  PendingRoomJoin,
  RoomSettingsChangedEvent,
  MatchStateChangedEvent,
  PlaylistItemAddedEvent,
  PlaylistItemChangedEvent,
  PlaylistItemRemovedEvent,
  UserStatusChangedEvent,
  UserModsChangedEvent,
  UserStyleChangedEvent,
  UserTeamChangedEvent,
  UserJoinedEvent,
  UserLeftEvent,
  UserKickedEvent,
  UserBannedEvent,
  RefereeAddedEvent,
  RefereeRemovedEvent,
  LazerPlayer,
  MatchUserStatus,
  ListRoomsResponse,
} from "../types.js";
import { invokeHub } from "./refereeHubClient.js";

class RoomManager {
  private rooms = new Map<number, RoomState>();
  private pendingJoins = new Map<number, PendingRoomJoin>();
  private resyncPromise: Promise<void> | null = null;
  private onRoomChanged: ((room: RoomState) => void) | null = null;
  private onRoomRemoved: ((roomId: number) => void) | null = null;
  private joinedChatChannels = new Set<number>();
  private chatWaiters = new Map<number, Array<() => void>>();

  setListeners(onChanged: (room: RoomState) => void, onRemoved: (roomId: number) => void): void {
    this.onRoomChanged = onChanged;
    this.onRoomRemoved = onRemoved;
  }

  trackRoom(room: RoomState): void {
    this.rooms.set(room.room_id, room);
    this.onRoomChanged?.(room);
  }

  getRoom(roomId: number): RoomState | undefined {
    return this.rooms.get(roomId);
  }

  getAllRooms(): RoomState[] {
    return [...this.rooms.values()];
  }

  getRoomByChatChannel(channelId: number): RoomState | undefined {
    return this.getAllRooms().find((room) => room.chat_channel_id === channelId);
  }

  markChatChannelJoined(channelId: number): void {
    this.joinedChatChannels.add(channelId);
    for (const resolve of this.chatWaiters.get(channelId) ?? []) resolve();
    this.chatWaiters.delete(channelId);
  }

  async waitForChatChannel(channelId: number, timeoutMs = 10_000): Promise<void> {
    if (this.joinedChatChannels.has(channelId)) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiters = this.chatWaiters.get(channelId) ?? [];
        this.chatWaiters.set(
          channelId,
          waiters.filter((waiter) => waiter !== done),
        );
        reject(new Error(`Chat channel ${channelId} was not joined in time.`));
      }, timeoutMs);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const waiters = this.chatWaiters.get(channelId) ?? [];
      waiters.push(done);
      this.chatWaiters.set(channelId, waiters);
    });
  }

  private findPlayer(room: RoomState, userId: number): LazerPlayer | undefined {
    return room.players.find((p) => p.user_id === userId);
  }

  private upsertPlayerStub(room: RoomState, userId: number): LazerPlayer {
    let player = this.findPlayer(room, userId);
    if (!player) {
      player = { user_id: userId, status: "idle", style: { ruleset_id: null, beatmap_id: null }, mods: [], team: null };
      room.players.push(player);
    }
    return player;
  }

  handleHubEvent(eventType: HubEventType, payload: HubEventPayloads[HubEventType]): void {
    const roomId = payload.room_id;
    if (typeof roomId !== "number") {
      console.warn(`[roomManager] event ${eventType} has no room_id, ignoring`, payload);
      return;
    }

    const pendingJoin = this.pendingJoins.get(roomId);
    if (pendingJoin) {
      // RefereeAdded is already covered by the pending JoinRoom snapshot.
      if (eventType !== "RefereeAdded") pendingJoin.events.push({ eventType, payload });
      return;
    }

    if (eventType === "RefereeAdded") {
      const event = payload as unknown as RefereeAddedEvent;
      this.joinRoom(event.room_id).catch((error) => {
        console.error(`[roomManager] failed to join room ${event.room_id} after RefereeAdded: ${(error as Error).message}`);
      });
      return;
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      // If we don't have the room tracked, we can't update it. Safely ignoring instead
      console.warn(`[roomManager] event ${eventType} for unknown room ${roomId}, ignoring`);
      return;
    }

    const previousState = JSON.stringify(room);

    switch (eventType) {
      case "RoomSettingsChanged": {
        const e = payload as unknown as RoomSettingsChangedEvent;
        room.name = e.name;
        room.password = e.password;
        room.state.type = e.type;
        room.max_participants = e.max_participants ?? room.max_participants;
        break;
      }
      case "MatchStateChanged": {
        const e = payload as unknown as MatchStateChangedEvent;
        room.state = e.state;
        break;
      }
      case "PlaylistItemAdded": {
        const e = payload as unknown as PlaylistItemAddedEvent;
        // A refreshed snapshot may already contain an event buffered during JoinRoom.
        const index = room.playlist.findIndex((item) => item.id === e.playlist_item.id);
        if (index === -1) room.playlist.push(e.playlist_item);
        else room.playlist[index] = e.playlist_item;
        break;
      }
      case "PlaylistItemChanged": {
        const e = payload as unknown as PlaylistItemChangedEvent;
        const index = room.playlist.findIndex((item) => item.id === e.playlist_item.id);
        if (index !== -1) room.playlist[index] = e.playlist_item;
        break;
      }
      case "PlaylistItemRemoved": {
        const e = payload as unknown as PlaylistItemRemovedEvent;
        room.playlist = room.playlist.filter((item) => item.id !== e.playlist_item_id);
        break;
      }
      case "UserJoined": {
        const e = payload as unknown as UserJoinedEvent;
        this.upsertPlayerStub(room, e.user_id);
        break;
      }
      case "UserLeft": {
        const e = payload as unknown as UserLeftEvent;
        room.players = room.players.filter((p) => p.user_id !== e.user_id);
        break;
      }
      case "UserKicked": {
        const e = payload as unknown as UserKickedEvent;
        room.players = room.players.filter((p) => p.user_id !== e.kicked_user_id);
        break;
      }
      case "UserBanned": {
        const e = payload as unknown as UserBannedEvent;
        room.players = room.players.filter((p) => p.user_id !== e.banned_user_id);
        break;
      }
      case "UserStatusChanged": {
        const e = payload as unknown as UserStatusChangedEvent;
        this.upsertPlayerStub(room, e.user_id).status = e.status as MatchUserStatus;
        break;
      }
      case "UserModsChanged": {
        const e = payload as unknown as UserModsChangedEvent;
        this.upsertPlayerStub(room, e.user_id).mods = e.mods;
        break;
      }
      case "UserStyleChanged": {
        const e = payload as unknown as UserStyleChangedEvent;
        this.upsertPlayerStub(room, e.user_id).style = { ruleset_id: e.ruleset_id, beatmap_id: e.beatmap_id };
        break;
      }
      case "UserTeamChanged": {
        const e = payload as unknown as UserTeamChangedEvent;
        this.upsertPlayerStub(room, e.user_id).team = e.team;
        break;
      }
      case "RefereeRemoved": {
        const e = payload as unknown as RefereeRemovedEvent;
        room.referees = room.referees.filter((r) => r.user_id !== e.user_id);
        break;
      }
      // Events without state changes are forwarded by index.ts
      default:
        return;
    }

    if (JSON.stringify(room) !== previousState) this.onRoomChanged?.(room);
  }

  removeRoom(roomId: number): void {
    const pending = this.pendingJoins.get(roomId);
    if (pending) pending.cancelled = true;
    if (this.rooms.delete(roomId)) {
      this.onRoomRemoved?.(roomId);
    }
  }

  private joinRoom(roomId: number): Promise<void> {
    const existing = this.pendingJoins.get(roomId);
    if (existing) return existing.promise;

    const pending: PendingRoomJoin = { cancelled: false, events: [], promise: Promise.resolve() };
    this.pendingJoins.set(roomId, pending);
    pending.promise = (async () => {
      try {
        const response = await invokeHub<RoomJoinedResponse>("JoinRoom", roomId);
        if (!pending.cancelled) this.rooms.set(roomId, response);
      } finally {
        this.pendingJoins.delete(roomId);
        // Replay only into a room we have a snapshot for. On failure, keep the
        // previous snapshot and apply live updates rather than discarding them.
        if (!pending.cancelled && this.rooms.has(roomId)) {
          for (const event of pending.events) this.handleHubEvent(event.eventType, event.payload);
          this.onRoomChanged?.(this.rooms.get(roomId)!);
        }
      }
    })();
    return pending.promise;
  }

  resync(): Promise<void> {
    if (this.resyncPromise) return this.resyncPromise;

    this.resyncPromise = (async () => {
      try {
        const response = await invokeHub<ListRoomsResponse>("ListRooms");
        const liveRoomIds = new Set(response.room_ids);

        for (const roomId of this.rooms.keys()) {
          if (!liveRoomIds.has(roomId)) this.removeRoom(roomId);
        }

        const errors: Error[] = [];
        for (const roomId of liveRoomIds) {
          try {
            // JoinRoom returns a full snapshot and restores hub subscriptions.
            await this.joinRoom(roomId);
          } catch (error) {
            const failure = new Error(`Failed to refresh room ${roomId}: ${(error as Error).message}`, { cause: error });
            console.error(`[roomManager] ${failure.message}`);
            errors.push(failure);
          }
        }
        if (errors.length) throw new AggregateError(errors, "Some rooms could not be synchronized.");
      } finally {
        this.resyncPromise = null;
      }
    })();
    return this.resyncPromise;
  }
}

export const roomManager = new RoomManager();
