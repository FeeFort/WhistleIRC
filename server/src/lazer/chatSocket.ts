import { WebSocket } from "ws";
import { config } from "../config.js";
import { ChatNotification, ChatSocketOptions } from "../types.js";

const RECONNECT_DELAY_MS = 5_000;

export class ChatSocket {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(private readonly options: ChatSocketOptions) {}

  async connect(): Promise<void> {
    this.closed = false;
    const token = typeof this.options.accessToken === "function" ? await this.options.accessToken() : this.options.accessToken;
    if (this.closed) return;
    const socket = new WebSocket(config.chatWebSocketUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    this.socket = socket;
    socket.on("open", () => socket.send(JSON.stringify({ event: "chat.start" })));
    socket.on("message", (raw) => {
      if (!this.closed && this.socket === socket) this.handleMessage(raw.toString());
    });
    socket.on("error", (error) => this.options.onError?.(error instanceof Error ? error : new Error(String(error))));
    socket.on("close", () => {
      if (this.socket === socket) this.socket = null;
      if (!this.closed && !this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          void this.connect().catch((error) => this.options.onError?.(error instanceof Error ? error : new Error(String(error))));
        }, RECONNECT_DELAY_MS);
      }
    });
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
  }

  private handleMessage(raw: string): void {
    if (!raw || raw === "{}") return;
    try {
      const parsed = JSON.parse(raw) as Partial<ChatNotification>;
      if (typeof parsed.event !== "string") return;
      this.options.onNotification({ event: parsed.event, data: parsed.data });
    } catch (error) {
      this.options.onError?.(error instanceof Error ? error : new Error("Invalid chat notification"));
    }
  }
}
