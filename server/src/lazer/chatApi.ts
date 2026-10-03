import { getAccessToken } from "../auth/auth.js";
import { fetchApi } from "../osu-api/osuApiClient.js";
import type { ChatMessage } from "../types.js";

const CHAT_HISTORY_PAGE_SIZE = 50;
const API_REQUEST_INTERVAL_MS = 1_000;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function sendChatMessage(channelId: number, message: string, isAction = false): Promise<unknown> {
  return fetchApi(await getAccessToken(), `chat/channels/${channelId}/messages`, "POST", { message, is_action: isAction });
}

export async function fetchChatMessages(channelId: number): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [];
  const messageIds = new Set<number>();
  let until: number | undefined;

  while (true) {
    const endpoint = `chat/channels/${channelId}/messages?limit=${CHAT_HISTORY_PAGE_SIZE}${until === undefined ? "" : `&until=${until}`}`;
    const page = await fetchApi(await getAccessToken(), endpoint) as ChatMessage[];
    if (!Array.isArray(page)) throw new Error("Chat API returned an invalid message history.");
    if (page.length === 0) break;

    const pageIds = page.map((message) => Number(message.message_id));
    const oldestId = Math.min(...pageIds);
    if (!Number.isSafeInteger(oldestId) || (until !== undefined && oldestId >= until)) {
      throw new Error("Chat API returned an invalid message history cursor.");
    }
    for (const message of page) {
      const messageId = Number(message.message_id);
      if (Number.isSafeInteger(messageId) && !messageIds.has(messageId)) {
        messageIds.add(messageId);
        messages.push(message);
      }
    }
    if (page.length < CHAT_HISTORY_PAGE_SIZE) break;
    until = oldestId;
    await wait(API_REQUEST_INTERVAL_MS);
  }

  return messages.sort((left, right) => Number(left.message_id) - Number(right.message_id));
}
