import type {
  RoomJoinedResponse as RoomState,
  RoomJoinedResponse,
  HubEventType,
  HubEventPayloads,
  PendingRoomJoin,
  MakeRoomRequest,
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
  LazerStatusHandler,
} from "../types.js";
import { invokeHub } from "./refereeHubClient.js";

class RoomManager {
  private generation = 0;
  private rooms = new Map<number, RoomState>();
  private pendingJoins = new Map<number, PendingRoomJoin>();
  private pendingCreations = new Set<PendingRoomJoin>();
  private resyncPromise: Promise<void> | null = null;
  private onRoomChanged: ((room: RoomState) => void) | null = null;
  private onStatus: LazerStatusHandler | null = null;
  private onRoomRemoved: ((roomId: number) => void) | null = null;
  private joinedChatChannels = new Set<number>();
  private chatWaiters = new Map<number, Array<(error?: Error) => void>>();

  setListeners(onChanged: (room: RoomState) => void, onRemoved: (roomId: number) => void, onStatus?: LazerStatusHandler): void {
    this.onRoomChanged = onChanged;
    this.onRoomRemoved = onRemoved;
    this.onStatus = onStatus ?? null;
  }

  reset(): void {
    ++this.generation;
    for (const pending of [...this.pendingJoins.values(), ...this.pendingCreations]) pending.cancelled = true;
    this.pendingJoins.clear();
    this.pendingCreations.clear();
    this.resyncPromise = null;
    for (const roomId of [...this.rooms.keys()]) this.removeRoom(roomId);
    this.joinedChatChannels.clear();
    for (const waiters of this.chatWaiters.values()) {
      for (const done of waiters) done(new Error("osu! session ended."));
    }
    this.chatWaiters.clear();
    this.onStatus?.({ type: "lazer_sync_state", state: "idle" });
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
      const done = (error?: Error) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
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

  handleHubEvent(eventType: HubEventType, payload: HubEventPayloads[HubEventType]): boolean {
    const roomId = payload.room_id;
    if (typeof roomId !== "number") {
      console.warn(`[roomManager] event ${eventType} has no room_id, ignoring`, payload);
      return false;
    }

    const pendingJoin = this.pendingJoins.get(roomId);
    if (pendingJoin) {
      pendingJoin.events.push({ eventType, payload });
      return true;
    }

    if (!this.rooms.has(roomId) && this.pendingCreations.size) {
      for (const creation of this.pendingCreations) creation.events.push({ eventType, payload });
      return true;
    }

    if (eventType === "RefereeAdded") {
      const event = payload as unknown as RefereeAddedEvent;
      const generation = this.generation;
      this.joinRoom(event.room_id).catch((error) => {
        if (generation !== this.generation) return;
        this.onStatus?.({ type: "lazer_room_error", roomId: event.room_id, operation: "join", message: error instanceof Error ? error.message : String(error) });
        console.error(`[roomManager] failed to join room ${event.room_id} after RefereeAdded: ${(error as Error).message}`);
      });
      return true;
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      // If we don't have the room tracked, we can't update it. Safely ignoring instead
      console.warn(`[roomManager] event ${eventType} for unknown room ${roomId}, ignoring`);
      return false;
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
        return true;
    }

    if (JSON.stringify(room) !== previousState) this.onRoomChanged?.(room);
    return true;
  }

  removeRoom(roomId: number): void {
    const pending = this.pendingJoins.get(roomId);
    if (pending) pending.cancelled = true;
    if (this.rooms.delete(roomId)) {
      this.onRoomRemoved?.(roomId);
    }
  }

  async joinRoom(roomId: number | null, request?: MakeRoomRequest): Promise<RoomState> {
    const generation = this.generation;
    const existing = roomId === null ? undefined : this.pendingJoins.get(roomId);
    if (existing) {
      await existing.promise;
      if (generation !== this.generation) throw new Error("osu! session ended.");
      const room = roomId === null ? undefined : this.rooms.get(roomId);
      if (!room) throw new Error(`Room ${roomId} was not joined.`);
      return room;
    }

    const pending: PendingRoomJoin = { cancelled: false, events: [], promise: Promise.resolve() };
    if (roomId === null) this.pendingCreations.add(pending);
    else this.pendingJoins.set(roomId, pending);
    pending.promise = (async () => {
      try {
        const response = roomId === null ? await invokeHub<RoomJoinedResponse>("MakeRoom", request) : await invokeHub<RoomJoinedResponse>("JoinRoom", roomId);
        roomId = response.room_id;
        if (!pending.cancelled) this.rooms.set(roomId, response);
      } finally {
        this.pendingCreations.delete(pending);
        if (roomId !== null && this.pendingJoins.get(roomId) === pending) this.pendingJoins.delete(roomId);
        if (!pending.cancelled && roomId !== null && this.rooms.has(roomId)) {
          for (const event of pending.events) {
            if (event.payload.room_id === roomId) {
              if (event.eventType === "RefereeAdded") {
                const userId = (event.payload as RefereeAddedEvent).user_id;
                const room = this.rooms.get(roomId)!;
                if (!room.referees.some((referee) => referee.user_id === userId)) room.referees.push({ user_id: userId });
              } else this.handleHubEvent(event.eventType, event.payload);
            }
          }
          this.onRoomChanged?.(this.rooms.get(roomId)!);
        }
      }
    })();
    await pending.promise;
    if (pending.cancelled || generation !== this.generation) throw new Error("osu! session ended.");
    const room = roomId === null ? undefined : this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} was not joined.`);
    return room;
  }

  resync(): Promise<void> {
    if (this.resyncPromise) return this.resyncPromise;

    const generation = this.generation;
    this.onStatus?.({ type: "lazer_sync_state", state: "syncing" });
    this.resyncPromise = (async () => {
      const failedRoomIds: number[] = [];
      let listed = false;
      try {
        const response = await invokeHub<ListRoomsResponse>("ListRooms");
        if (generation !== this.generation) throw new Error("osu! session ended.");
        const liveRoomIds = new Set(response.room_ids);
        listed = true;

        for (const roomId of this.rooms.keys()) {
          if (!liveRoomIds.has(roomId)) this.removeRoom(roomId);
        }

        const errors: Error[] = [];
        for (const roomId of liveRoomIds) {
          try {
            // JoinRoom returns a full snapshot and restores hub subscriptions.
            await this.joinRoom(roomId);
          } catch (error) {
            if (generation !== this.generation) throw error;
            const failure = new Error(`Failed to refresh room ${roomId}: ${(error as Error).message}`, { cause: error });
            console.error(`[roomManager] ${failure.message}`);
            errors.push(failure);
            failedRoomIds.push(roomId);
          }
        }
        if (errors.length) throw new AggregateError(errors, "Some rooms could not be synchronized.");
        this.onStatus?.({ type: "lazer_sync_state", state: "synced" });
      } catch (error) {
        if (generation === this.generation)
          this.onStatus?.({ type: "lazer_sync_state", state: "failed", scope: listed ? "partial" : "all", failedRoomIds, message: error instanceof Error ? error.message : String(error) });
        // TODO: Retry using the shared API exponential backoff policy once implemented.
        throw error;
      } finally {
        if (generation === this.generation) this.resyncPromise = null;
      }
    })();
    return this.resyncPromise;
  }
}

export const roomManager = new RoomManager();
