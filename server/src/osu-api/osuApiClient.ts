import { logger } from "../logger/logger.js";
import { config } from "../config.js";
import { InternalApiMethod, OsuApiMeResponse, OsuUser } from "../types.js";

import { restRateLimiter } from "../rateLimiter.js";
import isRetryableError, { hasRetryAfter } from "./retryableErrors.js";
import OsuApiError from "./osuApiError.js";

const log = logger.child("core", "osuApi");

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const OSU_API_URL = `${config.osuWebUrl}/api/v2/`;


export async function fetchApi(accessToken: string, endpoint: string, method?: InternalApiMethod, body?: Record<string, unknown>): Promise<unknown> {
  const isGet = !method || method === "GET";
  const allowedAttempts = isGet ? config.transportRetry.attempts : 1;

  for (let attempt = 1; attempt <= allowedAttempts; attempt++) {
    try {
      log.debug("API request attempt", { method, endpoint, attempt, allowedAttempts });
      return await fetchApiOnce(accessToken, endpoint, method, body);
    } catch (error) {
      if (attempt >= allowedAttempts || !isRetryableError(error)) throw error;

      const retryAfter = hasRetryAfter(error) ? error.retryAfter : undefined;
      const delayCap = Math.min(config.transportRetry.maxDelay, config.transportRetry.baseDelay * 2 ** (attempt - 1));
      const delay = retryAfter ?? Math.round(delayCap / 2 + Math.random() * (delayCap / 2));

      log.debug("API request failed, retrying", { method, endpoint, attempt, allowedAttempts, delayCap, delay, delaySource: retryAfter !== undefined ? "retry-after" : "backoff",error });
      await sleep(delay);
    }
  }
}

export async function fetchMe(accessToken: string): Promise<OsuUser> {
  const raw = (await fetchApi(accessToken, "me")) as OsuApiMeResponse;

  return { id: raw.id, username: raw.username, avatarUrl: raw.avatar_url };
}

async function fetchApiOnce(accessToken: string, endpoint: string, method?: InternalApiMethod, body?: Record<string, unknown>): Promise<unknown> {
  if (!method) method = "GET";

  log.debug("API request queued", { method, endpoint });
  const release = await restRateLimiter.acquire();
  const operation = log.traceStart(`${method} ${endpoint}`, () => ({ body: JSON.stringify(body, (key, value) => (/password|token|secret|authorization/i.test(key) ? "[redacted]" : value)) }));
  const signal = AbortSignal.timeout(config.apiRequestTimeoutMs);
  try {
    const response = await fetch(OSU_API_URL + endpoint.replace(/^\//, ""), {
      signal,
      method: method,
      headers: { Authorization: `Bearer ${accessToken.trim()}`, ...(method === "GET" ? {} : { "Content-Type": "application/json" }) },
      body: body ? JSON.stringify(body) : undefined,
    });

    log.debug("API response received", { method, endpoint, status: response.status });
    checkApiRateLimit(response);
    if (!response.ok) {
      throw await OsuApiError.fromResponse(response);
    }

    if (response.status === 204 || method === "DELETE") {
      operation.end({ status: response.status });
      return undefined;
    }
    const result: unknown = await response.json();
    operation.end(() => ({ status: response.status, result: JSON.stringify(result, (key, value) => (/password|token|secret|authorization/i.test(key) ? "[redacted]" : value)) }));
    return result;
  } catch (error) {
    operation.fail(error);
    if (signal.aborted)
      throw Object.assign(new Error("API request timed out; its outcome may be unknown."), {
        code: "REQUEST_TIMEOUT",
        outcomeUnknown: method !== "GET",
      });
    // TODO: Use shared exponential backoff retries for safe API operations.
    throw error;
  } finally {
    release();
  }
}

export function checkApiRateLimit(response: Response): void {
  if (response.status === 429) {
    const header = response.headers.get("Retry-After");
    const seconds = header === null ? NaN : Number(header);
    const retryAfterMs = Math.min(2_147_483_647, Math.max(1000, Number.isFinite(seconds) ? seconds * 1000 : (header ? Date.parse(header) - Date.now() : NaN) || 60_000));
    restRateLimiter.pause(retryAfterMs);
    // TODO: Retry safe API operations with shared exponential backoff and Retry-After.
    throw Object.assign(new Error("osu! API request limit reached. Please try again later."), { code: "RATE_LIMITED", outcomeUnknown: false, retryAfterMs });
  }
}
