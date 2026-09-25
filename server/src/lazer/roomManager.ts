import { RoomChangeListener, RoomRemovedListener } from "../types.js";
import { invokeHub } from "./refereeHubClient.js";

interface RoomState {
  roomId: number;
  [key: string]: unknown;
}



class RoomManager {
  private rooms = new Map<number, RoomState>();
  private onRoomChanged: RoomChangeListener | null = null;
  private onRoomRemoved: RoomRemovedListener | null = null;

  setListeners(onChanged: RoomChangeListener, onRemoved: RoomRemovedListener): void {
    this.onRoomChanged = onChanged;
    this.onRoomRemoved = onRemoved;
  }

  handleHubEvent(eventType: string, payload: Record<string, unknown>): void {
    const roomId = payload.room_id;
    if (typeof roomId !== "number") {
      console.warn(`[roomManager] event ${eventType} has no room_id, ignoring`, payload);
      return;
    }
    // server reports about being added as a ref to the lobby with id, but doesn't join the room automatically, therefore invoking the method to join
    if (eventType === "RefereeAdded") {
      this.joinRoom(roomId).catch((error) => {
        console.error(`[roomManager] failed to join room ${roomId} after RefereeAdded: ${(error as Error).message}`);
      });
      return;
    }

    let room = this.rooms.get(roomId);
    if (!room) {
      room = { roomId };
      this.rooms.set(roomId, room);
    }

    Object.assign(room, payload);
    this.onRoomChanged?.(room);
  }

  private async joinRoom(roomId: number): Promise<void> {
    const response = await invokeHub("JoinRoom", roomId);
    const room: RoomState = { roomId, ...(response as object) };
    this.rooms.set(roomId, room);
    this.onRoomChanged?.(room);
  }

  getRoom(roomId: number): RoomState | undefined {
    return this.rooms.get(roomId);
  }

  getAllRooms(): RoomState[] {
    return [...this.rooms.values()];
  }

  removeRoom(roomId: number): void {
    if (this.rooms.delete(roomId)) {
      this.onRoomRemoved?.(roomId);
    }
  }
  // checks local rooms list against the one on the server, should be called on reconnect
  async resync(): Promise<void> {
    const response = await invokeHub<{ room_ids: number[] }>("ListRooms");
    const liveRoomIds = new Set(response.room_ids);

    for (const roomId of this.rooms.keys()) {
      if (!liveRoomIds.has(roomId)) {
        this.removeRoom(roomId);
      }
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
