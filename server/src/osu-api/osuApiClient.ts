import { config } from "../config.js";
import { InternalApiMethod, OsuApiMeResponse, OsuUser } from "../types.js";

import { restRateLimiter } from "../rateLimiter.js";

const OSU_API_URL = "https://osu.ppy.sh/api/v2/";

export class OsuApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly authentication?: string,
    public readonly apiMessage?: string,
  ) {
    super(apiMessage ?? authentication ?? `osu! api returned ${status}`);
    this.name = "OsuApiError";
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  static async fromResponse(response: Response): Promise<OsuApiError> {
    const rawBody = await response.text();

    if (!rawBody) {
      return new OsuApiError(response.status);
    }

    try {
      const parsed = JSON.parse(rawBody) as {
        authentication?: string;
        error?: string | null;
      };
      return new OsuApiError(response.status, parsed.authentication, parsed.error ?? undefined);
    } catch {
      return new OsuApiError(response.status, undefined, rawBody.slice(0, 200));
    }
  }
}

export async function fetchMe(accessToken: string): Promise<OsuUser> {
  const raw = (await fetchApi(accessToken, "me")) as OsuApiMeResponse;

  return { id: raw.id, username: raw.username, avatarUrl: raw.avatar_url };
}

export async function fetchApi(accessToken: string, endpoint: string, method?: InternalApiMethod, body?: Record<string, unknown>): Promise<unknown> {
  if (!method) method = "GET";

  const release = await restRateLimiter.acquire();
  const signal = AbortSignal.timeout(config.apiRequestTimeoutMs);
  try {
    const response = await fetch(OSU_API_URL + endpoint.replace(/^\//, ""), {
      signal,
      method: method,
      headers: { Authorization: `Bearer ${accessToken.trim()}`, ...(method === "GET" ? {} : { "Content-Type": "application/json" }) },
      body: body ? JSON.stringify(body) : undefined,
    });

    checkApiRateLimit(response);
    if (!response.ok) {
      throw await OsuApiError.fromResponse(response);
    }

    if (response.status === 204 || method === "DELETE") return undefined;
    return await response.json();
  } catch (error) {
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
