import { AsyncLocalStorage } from "node:async_hooks";
import type { ClientMessage } from "./types.js";
import { WebSocket } from "ws";

export const requestContext = new AsyncLocalStorage<Pick<ClientMessage, "requestId">>();

const clients = new Set<WebSocket>();

export function addClient(client: WebSocket): void {
  clients.add(client);
}

export function removeClient(client: WebSocket): void {
  clients.delete(client);
}

export function sendJson(client: WebSocket, payload: unknown): void {
  if (client.readyState === WebSocket.OPEN) {
    const requestId = requestContext.getStore()?.requestId;
    if (requestId !== undefined && typeof payload === "object" && payload !== null && "type" in payload && (payload.type === "ack" || payload.type === "error")) {
      payload = { ...payload, requestId };
    }
    client.send(JSON.stringify(payload));
  }
}

export function broadcast(payload: unknown): void {
  for (const client of clients) {
    sendJson(client, payload);
  }
}

export function clientCount(): number {
  return clients.size;
}
