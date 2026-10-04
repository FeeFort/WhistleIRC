import assert from "node:assert/strict";
import { test } from "node:test";
import { config } from "../src/config.ts";
import { fetchApi } from "../src/osu-api/osuApiClient.ts";
import { requestContext, sendJson } from "../src/wsGateway.ts";

await test("concurrent responses preserve their own requestId", async () => {
  const replies = [];
  const client = { readyState: 1, send: (text) => replies.push(JSON.parse(text)) };
  let release;
  const first = requestContext.run({ requestId: "first" }, async () => {
    await new Promise((resolve) => {
      release = resolve;
    });
    sendJson(client, { type: "error", message: "Failed" });
  });
  requestContext.run({ requestId: "second" }, () => sendJson(client, { type: "ack", received: "lazer_roll" }));
  release();
  await first;
  assert.deepEqual(
    replies.map((reply) => reply.requestId),
    ["second", "first"],
  );
  sendJson(client, { type: "ack" });
  assert.equal(replies.at(-1).requestId, undefined);
});

await test("API timeout aborts requests and distinguishes reads from mutations", async (t) => {
  const previousTimeout = config.apiRequestTimeoutMs;
  config.apiRequestTimeoutMs = 10;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
  );
  // AbortSignal.timeout does not keep Node alive itself.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    for (const method of ["GET", "POST"]) {
      await assert.rejects(fetchApi("token", "chat/channels/1/messages", method), (error) => error.code === "REQUEST_TIMEOUT" && error.outcomeUnknown === (method === "POST"));
    }
  } finally {
    clearInterval(keepAlive);
    config.apiRequestTimeoutMs = previousTimeout;
  }
});
