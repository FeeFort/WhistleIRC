import { OsuOAuthCredentials, OsuOAuthErrorResponse, OsuTokenResponse, OsuTokenSet } from "../types.js";

const OSU_TOKEN_URL = "https://osu.ppy.sh/oauth/token";

export class OsuOAuthError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly description?: string,
  ) {
    super(description ?? code);
    this.name = "OsuOAuthError";
  }

  static async fromResponse(response: Response): Promise<OsuOAuthError> {
    const rawBody = await response.text();

    try {
      const parsed = JSON.parse(rawBody) as Partial<OsuOAuthErrorResponse>;
      return new OsuOAuthError(parsed.error ?? "unknown_error", response.status, parsed.hint ?? parsed.error_description);
    } catch {
      return new OsuOAuthError("unknown_error", response.status, rawBody.slice(0, 200) || undefined);
    }
  }
}

export async function exchangeCode(creds: OsuOAuthCredentials, code: string): Promise<OsuTokenSet> {
  const response = await fetch(OSU_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId.trim(),
      client_secret: creds.clientSecret.trim(),
      code,
      grant_type: "authorization_code",
      redirect_uri: creds.redirectUri.trim(),
    }),
  });

  if (!response.ok) {
    throw await OsuOAuthError.fromResponse(response);
  }

  const raw = (await response.json()) as Partial<OsuTokenResponse>;

  if (!raw.access_token || !raw.refresh_token || !raw.expires_in) {
    throw new Error(`osu! returned ok, but response looks invalid:\n${JSON.stringify(raw, null, 2)}`);
  }

  return { accessToken: raw.access_token, refreshToken: raw.refresh_token, expiresAt: Date.now() + raw.expires_in * 1000 };
}

export async function refreshToken(creds: Pick<OsuOAuthCredentials, "clientId" | "clientSecret">, refresh_token: string): Promise<OsuTokenSet> {
  const response = await fetch(OSU_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId.trim(),
      client_secret: creds.clientSecret.trim(),
      grant_type: "refresh_token",
      refresh_token,
    }),
  });

  if (!response.ok) {
    throw await OsuOAuthError.fromResponse(response);
  }

  const raw = (await response.json()) as Partial<OsuTokenResponse>;

  if (!raw.access_token || !raw.refresh_token || !raw.expires_in) {
    throw new Error(`osu! returned ok, but response looks invalid:\n${JSON.stringify(raw, null, 2)}`);
  }

  return { accessToken: raw.access_token, refreshToken: raw.refresh_token, expiresAt: Date.now() + raw.expires_in * 1000 };
}
