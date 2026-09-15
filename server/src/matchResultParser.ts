export type Team = "red" | "blue";

export interface PlayerMapResult {
  userId: number;
  username: string;
  team: Team;
  score: number;
  accuracy: number; // percentage (0..100), rounded to two decimal places
  combo: number;
  misses: number;
  count300: number; // count_300 + count_geki
  count100: number; // count_100 + count_katu
  count50: number;
  mods: string[];
  passed: boolean;
  rank: string;
}

// score/misses/count300/count100/count50 are genuinely additive — the in-game scoreboard
// itself sums team score, and total team hit counts are meaningful numbers — so those stay
// pre-summed scalars. accuracy/combo are per-player performance, not naturally additive:
// summing accuracies past 1.0 (or averaging without being asked) would be a silent
// assumption, so those stay arrays. Reduce them explicitly:
// math.average(results.teamRed.accuracy), math.sum(...), etc.
// player1 / player2 / ... give direct access to one player without indexing into `players`.
export type TeamMapResult = {
  score: number;
  misses: number;
  count300: number;
  count100: number;
  count50: number;
  accuracy: number[];
  combo: number[];
  players: PlayerMapResult[];
} & Record<`player${number}`, PlayerMapResult>;

export interface MapResult {
  matchId: number;
  gameId: number;
  beatmapId: number;
  mode: string;
  mods: string[];
  startTime: string;
  endTime: string | null;
  teamRed: TeamMapResult;
  teamBlue: TeamMapResult;
}

interface RawMatchUser { id: number; username: string }
interface RawMatchScore {
  user_id: number;
  score: number;
  accuracy: number;
  max_combo: number;
  mods: string[];
  passed: boolean;
  rank: string;
  statistics?: { count_300?: number; count_100?: number; count_50?: number; count_miss?: number; count_geki?: number; count_katu?: number };
  match?: { team?: Team; slot?: number; pass?: boolean };
}
interface RawMatchGame {
  id: number;
  beatmap_id: number;
  mode: string;
  mods: string[];
  start_time: string;
  end_time: string | null;
  scores: RawMatchScore[];
}
interface RawMatchEvent { game?: RawMatchGame }
export interface RawMatchResponse { match: { id: number }; events: RawMatchEvent[]; users: RawMatchUser[] }

function buildTeam(scores: RawMatchScore[], team: Team, usernameById: Map<number, string>): TeamMapResult {
  const players: PlayerMapResult[] = scores
    .filter((score) => score.match?.team === team)
    .map((score) => ({
      userId: score.user_id,
      username: usernameById.get(score.user_id) ?? `User ${score.user_id}`,
      team,
      score: Number(score.score) || 0,
      accuracy: Math.round((Number(score.accuracy) || 0) * 10000) / 100,
      combo: Number(score.max_combo) || 0,
      misses: Number(score.statistics?.count_miss) || 0,
      count300: (Number(score.statistics?.count_300) || 0) + (Number(score.statistics?.count_geki) || 0),
      count100: (Number(score.statistics?.count_100) || 0) + (Number(score.statistics?.count_katu) || 0),
      count50: Number(score.statistics?.count_50) || 0,
      mods: Array.isArray(score.mods) ? score.mods : [],
      passed: Boolean(score.passed),
      rank: score.rank ?? "",
    }));

  const result = {
    score: players.reduce((sum, player) => sum + player.score, 0),
    misses: players.reduce((sum, player) => sum + player.misses, 0),
    count300: players.reduce((sum, player) => sum + player.count300, 0),
    count100: players.reduce((sum, player) => sum + player.count100, 0),
    count50: players.reduce((sum, player) => sum + player.count50, 0),
    accuracy: players.map((player) => player.accuracy),
    combo: players.map((player) => player.combo),
    players,
  } as TeamMapResult;
  players.forEach((player, index) => { (result as Record<string, PlayerMapResult>)[`player${index + 1}`] = player; });
  return result;
}

// Picks the most recently *completed* map. A map restarted mid-play shows up as its own
// event with an empty scores array (see: end_time null, scores: []) and is skipped here —
// only events that actually produced scores count as "the last map".
export function parseLastMapResult(response: RawMatchResponse): MapResult | null {
  const games = (response.events ?? [])
    .map((event) => event.game)
    .filter((game): game is RawMatchGame => Boolean(game) && Array.isArray(game!.scores) && game!.scores.length > 0);
  const game = games[games.length - 1];
  if (!game) return null;

  const usernameById = new Map((response.users ?? []).map((user) => [user.id, user.username]));

  return {
    matchId: response.match.id,
    gameId: game.id,
    beatmapId: game.beatmap_id,
    mode: game.mode,
    mods: Array.isArray(game.mods) ? game.mods : [],
    startTime: game.start_time,
    endTime: game.end_time,
    teamRed: buildTeam(game.scores, "red", usernameById),
    teamBlue: buildTeam(game.scores, "blue", usernameById),
  };
}
