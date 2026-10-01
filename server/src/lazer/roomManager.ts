import type {
  RoomJoinedResponse, RoomSettingsChangedEvent, MatchStateChangedEvent,
  PlaylistItemAddedEvent, PlaylistItemChangedEvent, PlaylistItemRemovedEvent,
  UserStatusChangedEvent, UserModsChangedEvent, UserStyleChangedEvent, UserTeamChangedEvent,
  UserJoinedEvent, UserLeftEvent, UserKickedEvent, UserBannedEvent,
  RefereeAddedEvent, RefereeRemovedEvent, LazerPlayer, MatchUserStatus,
  ListRoomsResponse,
} from "../types.js";
import { invokeHub } from "./refereeHubClient.js";

type RoomState = RoomJoinedResponse;

class RoomManager {
  private rooms = new Map<number, RoomState>();
  private onRoomChanged: ((room: RoomState) => void) | null = null;
  private onRoomRemoved: ((roomId: number) => void) | null = null;

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

  handleHubEvent(eventType: string, payload: Record<string, unknown>): void {
    const roomId = payload.room_id;
    if (typeof roomId !== "number") {
      console.warn(`[roomManager] event ${eventType} has no room_id, ignoring`, payload);
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
      // Событие по комнате, о которой мы ещё не знаем (например, RefereeRemoved
      // пришёл раньше, чем мы успели обработать RefereeAdded) — игнорируем безопасно.
      console.warn(`[roomManager] event ${eventType} for unknown room ${roomId}, ignoring`);
      return;
    }

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
        room.playlist.push(e.playlist_item);
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
      // CountdownStarted/Stopped, MatchStarted/Aborted/Completed, RollCompleted, RefereeInvited
      // don't mutate room state directly, rather they're transported to frontend as is
      // without RoomState changes (see index.ts).
      default:
        break;
    }

    this.onRoomChanged?.(room);
  }

  removeRoom(roomId: number): void {
    if (this.rooms.delete(roomId)) {
      this.onRoomRemoved?.(roomId);
    }
  }

  private async joinRoom(roomId: number): Promise<void> {
    const response = await invokeHub<RoomJoinedResponse>("JoinRoom", roomId);
    this.trackRoom(response);
  }

  async resync(): Promise<void> {
    const response = await invokeHub<ListRoomsResponse>("ListRooms");
    const liveRoomIds = new Set(response.room_ids);

    for (const roomId of this.rooms.keys()) {
      if (!liveRoomIds.has(roomId)) this.removeRoom(roomId);
    }
    for (const roomId of liveRoomIds) {
      if (!this.rooms.has(roomId)) {
        try {
          await this.joinRoom(roomId);
        } catch (error) {
          console.error(`[roomManager] failed to rejoin room ${roomId}: ${(error as Error).message}`);
        }
      }
    }
  }
}

export const roomManager = new RoomManager();
