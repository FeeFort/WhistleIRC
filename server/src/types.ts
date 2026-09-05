// Raw types, basically how osu! api responds
export interface OsuTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}

export interface OsuOAuthErrorResponse {
  error: string;
  error_description?: string;
  hint?: string;
}

// Normalized type
export interface OsuTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // absolute timestamp
}

// User profile
export interface OsuApiMeResponse {
  id: number;
  username: string;
  avatar_url: string;
  // everything else is irrelevant
}

export interface OsuUser {
  id: number;
  username: string;
  avatarUrl: string;
}

// Authenticating
export interface OsuOAuthCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export type AuthState =
  | { status: "unauthenticated" }
  | { status: "authenticating" }
  | { status: "authenticated"; tokens: OsuTokenSet; user: OsuUser; credentials: Pick<OsuOAuthCredentials, "clientId" | "clientSecret"> }
  | { status: "error"; message: string };

export type OsuScope = "public" | "multiplayer.write_manage" | "chat.read" | "chat.write" | "identify";

export type NotAuthenticatedReason = "not_logged_in" | "session_expired";

// BanchoBot parser types
export type TeamMode = "HeadToHead" | "TagCoop" | "TeamVs" | "TagTeamVs";
export type ScoreMode = "Score" | "Accuracy" | "Combo" | "ScoreV2";

export type RoomInfo = { name: string; qualifiers: boolean } | { name: string; qualifiers: boolean; teamRed: string; teamBlue: string };

export type TeamSettings = {
  teamMode: TeamMode;
  scoreMode: ScoreMode;
  size?: number;
};

export type BeatmapInfo = {
  id: number;
  beatmapId: number;
  url: string;
  title: string | null;
};

export type ActiveMods = { activeMods: string | null };

export type PlayerSnapshot = {
  username: string;
  profileUrl: string;
  userId: number | null;
  avatarUrl: string | null;
  slot: number;
  ready: boolean;
  team: "red" | "blue" | null;
  mods: string[];
};

export type PlayerJoined = { username: string; slot: number; team: string; mods: string[] };
export type PlayerLeft = { username: string };
export type PlayerScore = { username: string; score: number; result: string };
export type MatchFinished = { finished: true };
export type MatchMetadata = { bestOf: number } | { nextPickTeam: string };
export type SizeConfirmation = { size: number };
export type TimerMessage = { type: "aborted" } | { type: "finished" } | { type: "started"; seconds: number };
export type MpSetCommand = { teamMode: TeamMode; scoreMode: ScoreMode; size: number };
export type MpSizeCommand = { size: number };

export type ParsedBanchoBotMessage =
  | { type: "room"; value: RoomInfo }
  | { type: "settings"; value: TeamSettings }
  | { type: "beatmap"; value: { currentBeatmap: BeatmapInfo } }
  | { type: "mods"; value: ActiveMods }
  | { type: "player"; value: PlayerSnapshot }
  | { type: "player_joined"; value: PlayerJoined }
  | { type: "player_left"; value: PlayerLeft }
  | { type: "player_score"; value: PlayerScore }
  | { type: "match_finished"; value: MatchFinished }
  | { type: "metadata"; value: MatchMetadata }
  | { type: "size"; value: SizeConfirmation }
  | { type: "timer"; value: TimerMessage }
  | null;

export type ParsedLobbyCommand = { type: "settings"; value: MpSetCommand } | { type: "size"; value: MpSizeCommand } | null;

//Server data types
type Team = "red" | "blue";

type Player = {
  username: string;
  profileUrl: string | null;
  userId: number | null;
  avatarUrl: string | null;
  slot: number;
  ready: boolean;
  team: Team | null;
  mods: string[];
};

type LastPlay = {
  teamRedScore: number | null;
  teamBlueScore: number | null;
  scoreDifference: number | null;
  winnerTeam: Team | null;
};

type Timer = {
  active: boolean;
  endsAt: number | null;
};

type LobbyState = {
  id: number | null;
  name: string;
  qualifiers: boolean;
  teamRed: string;
  teamBlue: string;
  teamRedScore: number;
  teamBlueScore: number;
  bestOf: number | null;
  nextPickTeam: string | null;
  matchStatus: string | null;
  teamRedPlayers: string[];
  teamBluePlayers: string[];
  lastPlay: LastPlay;
  players: Player[];
  currentBeatmap: BeatmapInfo | null;
  activeMods: string | null;
  host: string | null;
  teamMode: TeamMode;
  scoreMode: ScoreMode;
  size: number;
  timer: Timer;
  status: "active" | "closed";
};

type IrcCredentials = { login: string; password: string };

type IrcLine = {
  prefix: string | null;
  command: string;
  params: string[];
};

type ConnectionState = "disconnected" | "connecting" | "authenticating" | "ready" | "error";
