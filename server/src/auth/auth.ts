import { fetchMe, OsuApiError } from "../osu-api/osuApiClient.js";
import { AuthState, NotAuthenticatedReason, OsuOAuthCredentials, OsuUser } from "../types.js";
import { exchangeCode, OsuOAuthError, refreshToken as refreshOsuToken } from "./osuOAuthClient.js";
import { config } from "../config.js";

const REFRESH_BUFFER_MS = 60_000;
export let authState: AuthState = { status: "unauthenticated" };

class NotAuthenticatedError extends Error {
  constructor(public readonly reason: NotAuthenticatedReason) {
    super(reason === "session_expired" ? "Session expired, re-authorization required" : "User not found");
    this.name = "NotAuthenticatedError";
  }
}

export async function login(creds: OsuOAuthCredentials, code: string): Promise<OsuUser> {
  authState = { status: "authenticating" };

  try {
    const tokens = await exchangeCode(creds, code);
    const user = await fetchMe(tokens.accessToken);

    authState = { status: "authenticated", tokens, user, credentials: creds };

    return user;
  } catch (error) {
    const message = error instanceof OsuOAuthError || error instanceof OsuApiError ? error.message : "Unable to reach osu! api — check internet connection";

    authState = { status: "error", message };
    throw error;
  }
}

export async function logout(): Promise<{ revokedRemotely: boolean }> {
  if (authState.status !== "authenticated") {
    authState = { status: "unauthenticated" };
    return { revokedRemotely: true };
  }

  const accessToken = authState.tokens.accessToken;

  try {
    const response = await fetch(new URL("/api/v2/oauth/tokens/current", config.osuWebUrl), { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });

    if (!response.ok) {
      const error = await OsuApiError.fromResponse(response);
      if (!error.isUnauthorized) {
        return { revokedRemotely: false };
      }
    }

    return { revokedRemotely: true };
  } catch {
    return { revokedRemotely: false };
  } finally {
    authState = { status: "unauthenticated" };
  }
}

export async function getAccessToken(): Promise<string> {
  if (authState.status !== "authenticated") {
    throw new NotAuthenticatedError("not_logged_in");
  }

  const { tokens, credentials } = authState;
  if (tokens.expiresAt - Date.now() > REFRESH_BUFFER_MS) {
    return tokens.accessToken;
  }

  try {
    const newTokens = await refreshOsuToken(credentials, tokens.refreshToken);
    authState = { ...authState, tokens: newTokens };
    return newTokens.accessToken;
  } catch (error) {
    if (error instanceof OsuOAuthError) {
      authState = { status: "unauthenticated" };
      throw new NotAuthenticatedError("session_expired");
    }
    throw error;
  }
}

export function getState(): AuthState {
  return authState;
}
