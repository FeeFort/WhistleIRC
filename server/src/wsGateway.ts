import { WebSocket } from "ws";

const clients = new Set<WebSocket>();

export function addClient(client: WebSocket): void {
  clients.add(client);
}

export function removeClient(client: WebSocket): void {
  clients.delete(client);
}

export function sendJson(client: WebSocket, payload: unknown): void {
  if (client.readyState === WebSocket.OPEN) {
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
