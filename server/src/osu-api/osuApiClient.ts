import { AllowedMethods, OsuApiMeResponse, OsuUser } from "../types.js";

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
  const response = await fetch(OSU_API_URL + "me", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken.trim()}` },
  });

  if (!response.ok) {
    throw await OsuApiError.fromResponse(response);
  }

  const raw = (await response.json()) as OsuApiMeResponse;

  return { id: raw.id, username: raw.username, avatarUrl: raw.avatar_url };
}

export async function fetchApi(accessToken: string, endpoint: string, method?: AllowedMethods, body?: Record<string, unknown>): Promise<unknown> {
  if (!method) method = "GET";
  
  const response = await fetch(OSU_API_URL + endpoint.replace(/^\//, ""), {
    method: method,
    headers: { Authorization: `Bearer ${accessToken.trim()}`, ...(method === "GET" ? {} : { "Content-Type": "application/json" }) },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw await OsuApiError.fromResponse(response);
  }

  return response.json();
}
