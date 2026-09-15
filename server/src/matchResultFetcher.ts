import { getAccessToken } from "./auth/auth.js";
import { fetchApi } from "./osu-api/osuApiClient.js";
import { parseLastMapResult } from "./matchResultParser.js";
import type { MapResult, RawMatchResponse } from "./matchResultParser.js";

// The API client owns the application's request queue; retries here only delay this one request.
export async function fetchLastMapResult(matchId: number): Promise<MapResult | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = (await fetchApi(await getAccessToken(), `/matches/${matchId}`)) as RawMatchResponse;
      return parseLastMapResult(response);
    } catch {
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return null;
}