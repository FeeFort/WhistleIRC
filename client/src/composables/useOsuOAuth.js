const AUTHORIZE_URL = "https://osu.ppy.sh/oauth/authorize";
const TOKEN_PROXY_URL = "/api/osu/oauth/token";
const STATE_KEY = "whistleirc-osu-oauth-state";

export function getOsuRedirectUri() {
  return import.meta.env.VITE_OSU_REDIRECT_URI || `${window.location.origin}${window.location.pathname}`;
}

function createState() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function startOsuAuthorization(clientId) {
  const state = createState();
  sessionStorage.setItem(STATE_KEY, state);

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getOsuRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  window.location.href = url.toString();
}

export function readOsuAuthorizationCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const error = params.get("error");

  if (!code && !error) return null;

  const state = params.get("state");
  const savedState = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  window.history.replaceState({}, document.title, getOsuRedirectUri());

  if (error) {
    throw new Error(params.get("error_description") || "osu! authorization was denied.");
  }
  if (!state || !savedState || state !== savedState) {
    throw new Error("osu! authorization state validation failed.");
  }

  return { code };
}

async function readResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error_description || payload?.message || fallbackMessage);
  }
  return payload;
}

export async function completeOsuAuthorization({ clientId, clientSecret, code }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: getOsuRedirectUri(),
  });
  const tokenResponse = await fetch(TOKEN_PROXY_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = await readResponse(tokenResponse, "Unable to exchange the osu! authorization code.");

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || "",
    expiresAt: Date.now() + Number(payload.expires_in || 0) * 1000,
    user: payload.user,
  };
}
