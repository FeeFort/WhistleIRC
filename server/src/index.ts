import http from "node:http";
import net from "node:net";
import path from "node:path";
import { execFile } from "node:child_process";
import express, { Request, Response } from "express";
import { WebSocket, WebSocketServer } from "ws";
import { parseBanchoBotMessage, parseLobbyCommand } from "./banchoBotParser.js";
import { login as loginOsu, logout as logoutOsu, getAccessToken } from "./auth/auth.js";
import { fetchApi } from "./osu-api/osuApiClient.js";
import { config } from "./config.js";
import { ClientMessage, ConnectionState, IrcCredentials, IrcLine, LobbyState, ParsedBanchoBotMessage, Player, PlayerScore } from "./types.js";
import { fileURLToPath } from "node:url";

const IRC_HOST = "irc.ppy.sh";
const IRC_PORT = 6667;
const AUTH_ERROR = "Login or password is incorrect.";

function formatLogTime(date = new Date()): string {
  return date.toTimeString().slice(0, 8);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);
const staticDirectory = path.join(__dirname, "..", "static");
const webSocketServer = new WebSocketServer({
  server: httpServer,
  path: "/ws",
});

app.use(express.static(staticDirectory));

app.get("/", (_request: Request, response: Response) => {
  response.sendFile(path.join(staticDirectory, "index.html"));
});

app.get("/health", (_request: Request, response: Response) => {
  response.status(200).send("ok");
});

function sendJson(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function parseIrcLine(line: string): IrcLine {
  let rest = line;
  let prefix = null;

  if (rest.startsWith(":")) {
    const prefixEnd = rest.indexOf(" ");
    if (prefixEnd === -1) {
      return { prefix: rest.slice(1), command: "", params: [] };
    }
    prefix = rest.slice(1, prefixEnd);
    rest = rest.slice(prefixEnd + 1);
  }

  const params = [];
  while (rest.length > 0) {
    if (rest.startsWith(":")) {
      params.push(rest.slice(1));
      break;
    }

    const separator = rest.indexOf(" ");
    if (separator === -1) {
      params.push(rest);
      break;
    }

    params.push(rest.slice(0, separator));
    rest = rest.slice(separator + 1).replace(/^ +/, "");
  }

  return {
    prefix,
    command: params.shift() || "",
    params,
  };
}

function getNick(prefix: string | null): string | null {
  if (!prefix) {
    return null;
  }
  return prefix.split("!", 1)[0];
}

function normalizeChannel(channel: string | null | undefined): string {
  return String(channel || "")
    .replace(/^:/, "")
    .toLowerCase();
}

function getMultiplayerId(channel: string): number | null {
  const match = normalizeChannel(channel).match(/^#?mp_(\d+)$/);
  return match ? Number(match[1]) : null;
}

function isMultiplayerChannel(channel: string): boolean {
  return getMultiplayerId(channel) !== null;
}

function getOppositePickTeam(state: Pick<LobbyState, "nextPickTeam" | "teamRed" | "teamBlue">): string | null {
  if (!state.nextPickTeam || !state.teamRed || !state.teamBlue) return null;
  if (state.nextPickTeam.toLowerCase() === state.teamRed.toLowerCase()) {
    return state.teamBlue;
  }
  if (state.nextPickTeam.toLowerCase() === state.teamBlue.toLowerCase()) {
    return state.teamRed;
  }
  return null;
}

function getWinningScore(bestOf: number | null): number | null {
  const value = Number(bestOf);
  return Number.isInteger(value) && value > 0 ? Math.ceil(value / 2) : null;
}

function getMatchStatus(state: LobbyState): string | null {
  const winningScore = getWinningScore(state.bestOf);
  const teamRedScore = Number(state.teamRedScore) || 0;
  const teamBlueScore = Number(state.teamBlueScore) || 0;

  if (winningScore && teamRedScore >= winningScore && teamRedScore > teamBlueScore) {
    return `${state.teamRed} wins the match! GG and WP!`;
  }
  if (winningScore && teamBlueScore >= winningScore && teamBlueScore > teamRedScore) {
    return `${state.teamBlue} wins the match! GG and WP!`;
  }
  return state.nextPickTeam ? `Next Pick: ${state.nextPickTeam}` : null;
}

function createLobbyState(channel: string): LobbyState {
  return {
    id: getMultiplayerId(channel),
    name: "",
    qualifiers: false,
    teamRed: "",
    teamBlue: "",
    teamRedScore: 0,
    teamBlueScore: 0,
    bestOf: null,
    nextPickTeam: null,
    matchStatus: null,
    teamRedPlayers: [],
    teamBluePlayers: [],
    lastPlay: {
      teamRedScore: null,
      teamBlueScore: null,
      scoreDifference: null,
      winnerTeam: null,
    },
    players: [],
    currentBeatmap: null,
    activeMods: null,
    host: null,
    teamMode: "HeadToHead",
    scoreMode: "Score",
    size: 16,
    timer: { active: false, endsAt: null },
    status: "active",
  };
}

function cloneLobbyState(state: LobbyState): LobbyState {
  return {
    ...state,
    timer: { ...state.timer },
    lastPlay: { ...state.lastPlay },
    currentBeatmap: state.currentBeatmap ? { ...state.currentBeatmap } : null,
    teamRedPlayers: [...state.teamRedPlayers],
    teamBluePlayers: [...state.teamBluePlayers],
    players: state.players.map((player) => ({ ...player })),
  };
}

function sameLobbyValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

class BanchoConnection {
  socket: net.Socket | null = null;
  state: ConnectionState = "disconnected";
  buffer = "";
  intentionalClose = false;
  credentials: IrcCredentials | null = null;
  clients: Set<WebSocket> = new Set();
  lobbyStates: Map<string, LobbyState> = new Map();
  matchScoreBuffers: Map<string, Map<string, number>> = new Map();
  pendingAutoSettings: Set<string> = new Set();

  addClient(client: WebSocket): void {
    this.clients.add(client);
    this.sendStatus(client);
    for (const [channel, state] of this.lobbyStates) {
      this.sendLobbyState(channel, state, client);
    }
  }

  removeClient(client: WebSocket): void {
    this.clients.delete(client);
  }

  broadcast(payload: unknown): void {
    for (const client of this.clients) {
      sendJson(client, payload);
    }
  }

  sendStatus(client: WebSocket | null = null, detail: string | null = null) {
    const payload: { type: string; state: ConnectionState; detail?: string } = { type: "status", state: this.state };
    if (detail) {
      payload.detail = detail;
    }

    if (client) {
      sendJson(client, payload);
    } else {
      this.broadcast(payload);
    }
  }

  setState(state: ConnectionState, detail: string | null = null): void {
    this.state = state;
    this.sendStatus(null, detail);
  }

  isOwnNick(nick: string | null): boolean {
    return Boolean(nick && this.credentials?.login && nick.toLowerCase() === this.credentials.login.toLowerCase());
  }

  getLobbyState(channel: string, reset = false): LobbyState {
    const key = normalizeChannel(channel);
    if (!this.lobbyStates.has(key) || reset) {
      this.lobbyStates.set(key, createLobbyState(channel));
      this.matchScoreBuffers.set(key, new Map());
    }
    return this.lobbyStates.get(key)!;
  }

  sendLobbyState(channel: string, state: LobbyState | undefined = this.lobbyStates.get(normalizeChannel(channel)), client: WebSocket | null = null): void {
    if (!state) return;
    const payload = {
      type: "lobby_state",
      channel: channel.replace(/^:/, ""),
      state: cloneLobbyState(state),
    };
    if (client) {
      sendJson(client, payload);
    } else {
      this.broadcast(payload);
    }
  }

  updateLobbyState(channel: string, update: Partial<LobbyState>): void {
    const state = this.getLobbyState(channel);
    let changed = false;

    const keys: (keyof LobbyState)[] = [
      "name",
      "qualifiers",
      "teamRed",
      "teamBlue",
      "teamRedScore",
      "teamBlueScore",
      "bestOf",
      "nextPickTeam",
      "teamRedPlayers",
      "teamBluePlayers",
      "lastPlay",
      "players",
      "currentBeatmap",
      "activeMods",
      "host",
      "teamMode",
      "scoreMode",
      "size",
      "status",
    ];

    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(update, key)) {
        const sameValue =
          key === "activeMods" && typeof state[key] === "string" && typeof update[key] === "string"
            ? (state[key] as string).toLowerCase() === (update[key] as string).toLowerCase()
            : sameLobbyValue(state[key], update[key]);
        if (!sameValue) changed = true;
        (state[key] as unknown) = update[key];
      }
    }

    if (update.timer) {
      const nextTimer = { ...state.timer, ...update.timer };
      if (state.timer.active !== nextTimer.active || state.timer.endsAt !== nextTimer.endsAt) {
        changed = true;
      }
      state.timer = nextTimer;
    }

    const matchStatus = getMatchStatus(state);
    if (state.matchStatus !== matchStatus) {
      state.matchStatus = matchStatus;
      changed = true;
    }

    if (changed) this.sendLobbyState(channel, state);
  }

  closeLobby(channel: string): void {
    const state = this.getLobbyState(channel);
    const changed = state.status !== "closed" || state.timer.active || state.timer.endsAt !== null;
    state.status = "closed";
    state.timer = { active: false, endsAt: null };
    this.matchScoreBuffers.set(normalizeChannel(channel), new Map());
    if (changed) this.sendLobbyState(channel, state);
  }

  updatePlayers(channel: string, players: Player[]): void {
    const normalizedPlayers = players.map((player) => ({ ...player }));
    this.updateLobbyState(channel, {
      players: normalizedPlayers,
      teamRedPlayers: normalizedPlayers.filter((player) => player.team === "red").map((player) => player.username),
      teamBluePlayers: normalizedPlayers.filter((player) => player.team === "blue").map((player) => player.username),
    });
  }

  upsertPlayer(channel: string, player: Partial<Player> & Pick<Player, "username" | "slot">): void {
    const state = this.getLobbyState(channel);
    const normalizedName = player.username.toLowerCase();
    const players = state.players.filter((item) => item.slot !== player.slot && item.username.toLowerCase() !== normalizedName);
    const previous = state.players.find((item) => item.slot === player.slot || item.username.toLowerCase() === normalizedName);
    this.updatePlayers(channel, [
      ...players,
      {
        ...previous,
        ...player,
        ready: player.ready ?? previous?.ready ?? false,
        team: player.team ?? previous?.team ?? null,
        mods: player.mods?.length || !previous?.mods ? (player.mods ?? []) : previous.mods,
        profileUrl: player.profileUrl || previous?.profileUrl || null,
        userId: player.userId ?? previous?.userId ?? null,
        avatarUrl: player.avatarUrl || previous?.avatarUrl || (player.userId ? `https://a.ppy.sh/${player.userId}` : null),
      },
    ]);
  }

  removePlayer(channel: string, username: string): void {
    const state = this.getLobbyState(channel);
    const players = state.players.filter((player) => player.username.toLowerCase() !== username.toLowerCase());
    if (players.length !== state.players.length) this.updatePlayers(channel, players);
  }

  recordPlayerScore(channel: string, result: PlayerScore): void {
    const key = normalizeChannel(channel);
    const scores = this.matchScoreBuffers.get(key) || new Map();
    scores.set(result.username.toLowerCase(), result.score);
    this.matchScoreBuffers.set(key, scores);
  }

  finishMatch(channel: string): void {
    const state = this.getLobbyState(channel);
    const scores = this.matchScoreBuffers.get(normalizeChannel(channel)) || new Map();
    if (!scores.size) return;

    const sumTeam = (players: string[]) => players.reduce((total, username) => total + (scores.get(username.toLowerCase()) || 0), 0);
    const teamRedScore = sumTeam(state.teamRedPlayers);
    const teamBlueScore = sumTeam(state.teamBluePlayers);
    const winnerTeam = teamRedScore === teamBlueScore ? null : teamRedScore > teamBlueScore ? "red" : "blue";
    const scoreDifference = winnerTeam ? Math.abs(teamRedScore - teamBlueScore) : 0;
    const nextPickTeam = getOppositePickTeam(state);
    const winningScore = getWinningScore(state.bestOf);

    this.updateLobbyState(channel, {
      lastPlay: {
        teamRedScore,
        teamBlueScore,
        scoreDifference,
        winnerTeam,
      },
      ...(nextPickTeam ? { nextPickTeam } : {}),
      ...(winnerTeam === "red" && (!winningScore || state.teamRedScore < winningScore) ? { teamRedScore: state.teamRedScore + 1 } : {}),
      ...(winnerTeam === "blue" && (!winningScore || state.teamBlueScore < winningScore) ? { teamBlueScore: state.teamBlueScore + 1 } : {}),
    });
    scores.clear();
  }

  handleLobbyMessage(channel: string, nick: string | null, text: string): void {
    const command = parseLobbyCommand(text);
    if (command) {
      this.updateLobbyState(channel, command.value);
    }

    if (nick?.toLowerCase() !== "banchobot") return;
    const parsed: ParsedBanchoBotMessage = parseBanchoBotMessage(text);
    if (!parsed) return;

    if (parsed.type === "room") {
      this.updateLobbyState(channel, {
        players: [],
        teamRedPlayers: [],
        teamBluePlayers: [],
        activeMods: null,
        currentBeatmap: null,
        host: null,
        ...parsed.value,
      });
    } else if (parsed.type === "settings" || parsed.type === "size") {
      this.updateLobbyState(channel, parsed.value);
    } else if (parsed.type === "beatmap" || parsed.type === "mods") {
      this.updateLobbyState(channel, parsed.value);
    } else if (parsed.type === "player") {
      this.upsertPlayer(channel, parsed.value);
    } else if (parsed.type === "player_joined") {
      this.upsertPlayer(channel, { ...parsed.value, ready: false });
    } else if (parsed.type === "player_left") {
      this.removePlayer(channel, parsed.value.username);
    } else if (parsed.type === "player_score") {
      this.recordPlayerScore(channel, parsed.value);
    } else if (parsed.type === "match_finished") {
      this.finishMatch(channel);
    } else if (parsed.type === "metadata") {
      this.updateLobbyState(channel, parsed.value);
    } else if (parsed.type === "timer") {
      const timer = parsed.value;
      if (timer.type === "started") {
        this.updateLobbyState(channel, {
          timer: {
            active: true,
            endsAt: Date.now() + timer.seconds * 1000,
          },
        });
      } else {
        this.updateLobbyState(channel, {
          timer: { active: false, endsAt: null },
        });
      }
    }
  }

  requestLobbySettings(channel: string): void {
    const key = normalizeChannel(channel);
    this.pendingAutoSettings.add(key);
    try {
      this.sendMessage(channel, "!mp settings");
      console.log(`[${formatLogTime()}] IRC OUT PRIVMSG ${channel} :!mp settings (automatic)`);
    } catch (error) {
      this.pendingAutoSettings.delete(key);
      console.error(`[${formatLogTime()}] IRC OUT PRIVMSG ${channel} :!mp settings failed: ${(error as Error).message}`);
    }
  }

  consumeAutoSettings(channel: string, nick: string | null, text: string): boolean {
    const key = normalizeChannel(channel);
    if (!this.isOwnNick(nick) || !this.pendingAutoSettings.has(key)) {
      return false;
    }
    if (!/^!mp\s+settings(?:\s|$)/i.test(text)) return false;
    this.pendingAutoSettings.delete(key);
    return true;
  }

  connect(login: string, password: string): void {
    if (this.state !== "disconnected" && this.state !== "error") {
      throw new Error("IRC connection is already active.");
    }

    this.buffer = "";
    this.intentionalClose = false;
    this.credentials = { login: login.replaceAll(" ", "_"), password };
    this.lobbyStates.clear();
    this.matchScoreBuffers.clear();
    this.pendingAutoSettings.clear();
    this.setState("connecting");

    const socket = net.createConnection({ host: IRC_HOST, port: IRC_PORT });
    this.socket = socket;

    socket.setEncoding("utf8");
    socket.on("connect", () => {
      if (this.socket !== socket) {
        return;
      }

      this.setState("authenticating");
      this.sendRaw(`PASS ${this.credentials!.password}`);
      this.sendRaw(`NICK ${this.credentials!.login}`);
      this.sendRaw(`USER ${this.credentials!.login} 0 * :${this.credentials!.login}`);
    });

    socket.on("data", (chunk: Buffer | string) => {
      if (this.socket !== socket) {
        return;
      }
      this.handleData(chunk.toString());
    });

    socket.on("error", (error: Error) => {
      if (this.socket !== socket || this.intentionalClose) {
        return;
      }
      this.setState("error", error.message);
    });

    socket.on("close", () => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      this.buffer = "";
      if (!this.intentionalClose && this.state !== "error") {
        this.setState("disconnected", "IRC connection closed.");
      }
      this.intentionalClose = false;
    });
  }

  handleData(chunk: string): void {
    this.buffer += chunk;
    while (this.buffer.includes("\n")) {
      const lineEnd = this.buffer.indexOf("\n");
      const line = this.buffer.slice(0, lineEnd).replace(/\r$/, "");
      this.buffer = this.buffer.slice(lineEnd + 1);
      this.handleLine(line);
    }
  }

  handleLine(line: string): void {
    const message = parseIrcLine(line);

    if (message.command.toUpperCase() !== "QUIT") {
      console.log(`[${formatLogTime()}] IRC ${line}`);
    }

    if (line.startsWith("PING")) {
      const payload = line.slice(4).trimStart();
      const pong = payload ? `PONG ${payload}` : "PONG";
      try {
        this.sendRaw(pong);
        console.log(`[${formatLogTime()}] IRC OUT ${pong}`);
      } catch (error) {
        console.error(`[${formatLogTime()}] IRC OUT ${pong} failed: ${(error as Error).message}`);
      }
      return;
    }

    if (message.command === "001") {
      this.setState("ready");
    }

    if (["433", "451", "464"].includes(message.command)) {
      this.setState("error", AUTH_ERROR);
    }

    if (message.command === "372" && message.params.some((param) => param.toLowerCase().includes("required to authenticate"))) {
      this.setState("error", AUTH_ERROR);
    }

    this.broadcast({
      type: "irc_event",
      raw: line,
      command: message.command,
      prefix: message.prefix,
      nick: getNick(message.prefix),
      params: message.params,
    });

    if (message.command === "PRIVMSG" && message.params.length >= 2) {
      const target = message.params[0];
      const nick = getNick(message.prefix);
      const text = message.params[1];
      const channel = this.credentials?.login && target.toLowerCase() === this.credentials.login.toLowerCase() ? "BanchoBot" : target;
      if (isMultiplayerChannel(channel)) {
        this.handleLobbyMessage(channel, nick, text);
      }
      if (!this.consumeAutoSettings(channel, nick, text)) {
        this.broadcast({
          type: "message",
          channel,
          nick,
          text,
          timestamp: new Date().toISOString(),
        });
      }
    }

    if (["JOIN", "PART"].includes(message.command) && message.params[0]) {
      const channel = message.params[0].replace(/^:/, "");
      const nick = getNick(message.prefix);
      console.log(`[${formatLogTime()}] IRC ${message.command} ${channel}`);
      if (isMultiplayerChannel(channel) && this.isOwnNick(nick)) {
        if (message.command === "JOIN") {
          this.getLobbyState(channel, true);
        } else {
          this.closeLobby(channel);
        }
      }
      this.broadcast({
        type: message.command === "JOIN" ? "channel_joined" : "channel_parted",
        channel,
        nick,
      });
      if (message.command === "JOIN" && isMultiplayerChannel(channel) && this.isOwnNick(nick)) {
        this.sendLobbyState(channel);
      }
      if (message.command === "JOIN" && isMultiplayerChannel(channel) && this.isOwnNick(nick)) {
        this.requestLobbySettings(channel);
      }
    }
  }

  sendRaw(line: string): void {
    if (!this.socket || this.socket.destroyed) {
      throw new Error("IRC connection is not open.");
    }
    this.socket.write(`${line}\r\n`, "utf8");
  }

  sendMessage(channel: string, text: string): void {
    this.sendRaw(`PRIVMSG ${channel} :${text}`);
    if (isMultiplayerChannel(channel)) {
      const command = parseLobbyCommand(text);
      if (command) this.updateLobbyState(channel, command.value);
    }
  }

  joinChannel(channel: string): void {
    this.sendRaw(`JOIN ${channel}`);
  }

  leaveChannel(channel: string): void {
    this.sendRaw(`PART ${channel}`);
  }

  logout(): void {
    if (!this.socket) {
      this.credentials = null;
      this.lobbyStates.clear();
      this.matchScoreBuffers.clear();
      this.pendingAutoSettings.clear();
      this.setState("disconnected");
      return;
    }

    const socket = this.socket;
    this.intentionalClose = true;
    if (!socket.destroyed) {
      socket.write("QUIT :Client logout\r\n", "utf8");
      socket.end();
    }
    this.socket = null;
    this.buffer = "";
    this.credentials = null;
    this.lobbyStates.clear();
    this.matchScoreBuffers.clear();
    this.pendingAutoSettings.clear();
    this.setState("disconnected");
  }
}

const banchoConnection = new BanchoConnection();
let shuttingDown = false;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateMessage(message: unknown): string | null {
  if (!isRecord(message)) {
    return "Message must be a JSON object.";
  }

  if (!isNonEmptyString(message.type)) {
    return "Message type must be a non-empty string.";
  }

  const validators: Record<string, () => string | null> = {
    login: () => {
      if (!isNonEmptyString(message.login)) {
        return "login must be a non-empty string.";
      }
      if (!isNonEmptyString(message.password)) {
        return "password must be a non-empty string.";
      }
      return null;
    },
    logout: () => null,
    osu_login: () => {
      if (!isNonEmptyString(message.clientId)) return "clientId must be a non-empty string.";
      if (!isNonEmptyString(message.clientSecret)) return "clientSecret must be a non-empty string.";
      if (!isNonEmptyString(message.code)) return "code must be a non-empty string.";
      if (!isNonEmptyString(message.redirectUri)) return "redirectUri must be a non-empty string.";
      return null;
    },
    osu_logout: () => null,
    api_request: () => {
      if (!isNonEmptyString(message.endpoint)) return "endpoint must be a non-empty string.";
      return null;
    },
    send_message: () => {
      if (!isNonEmptyString(message.channel)) {
        return "channel must be a non-empty string.";
      }
      if (!isNonEmptyString(message.message)) {
        return "message must be a non-empty string.";
      }
      return null;
    },
    join_channel: () => {
      if (!isNonEmptyString(message.channel)) {
        return "channel must be a non-empty string.";
      }
      return null;
    },
    leave_channel: () => {
      if (!isNonEmptyString(message.channel)) {
        return "channel must be a non-empty string.";
      }
      return null;
    },
    part_channel: () => {
      if (!isNonEmptyString(message.channel)) {
        return "channel must be a non-empty string.";
      }
      return null;
    },
    set_lobby_score: () => {
      if (!isNonEmptyString(message.channel)) {
        return "channel must be a non-empty string.";
      }
      if (!Number.isInteger(message.teamRedScore) || (message.teamRedScore as number) < 0) {
        return "teamRedScore must be a non-negative integer.";
      }
      if (!Number.isInteger(message.teamBlueScore) || (message.teamBlueScore as number) < 0) {
        return "teamBlueScore must be a non-negative integer.";
      }
      return null;
    },
    set_lobby_settings: () => {
      if (!isNonEmptyString(message.channel)) {
        return "channel must be a non-empty string.";
      }
      if (message.bestOf !== null && (!Number.isInteger(message.bestOf) || (message.bestOf as number) < 1)) {
        return "bestOf must be null or a positive integer.";
      }
      if (message.nextPickTeam !== null && !isNonEmptyString(message.nextPickTeam)) {
        return "nextPickTeam must be null or a non-empty string.";
      }
      return null;
    },
  };

  const validator = validators[message.type];
  if (!validator) {
    return `Unknown message type: ${message.type}`;
  }

  return validator();
}

function handleLogin(client: WebSocket, message: ClientMessage): void {
  const { login, password } = message as Extract<ClientMessage, { type: "login" }>;
  try {
    banchoConnection.addClient(client);
    banchoConnection.connect(login.trim(), password);
    sendJson(client, { type: "ack", received: message.type });
  } catch (error) {
    sendJson(client, { type: "error", message: (error as Error).message });
  }
}

function handleLogout(client: WebSocket): void {
  banchoConnection.logout();
  sendJson(client, { type: "ack", received: "logout" });
}

async function handleOsuLogin(client: WebSocket, message: ClientMessage): Promise<void> {
  const { clientId, clientSecret, code, redirectUri } = message as Extract<ClientMessage, { type: "osu_login" }>;
  try {
    const user = await loginOsu({ clientId: clientId.trim(), clientSecret: clientSecret, redirectUri: redirectUri.trim() }, code.trim());
    sendJson(client, { type: "osu_user", user });
  } catch (error) {
    console.error(`[${formatLogTime()}] osu! OAuth request failed: ${(error as Error).message}`);
    sendJson(client, { type: "error", request: "osu_login", message: (error as Error).message || "Unable to reach the osu! API." });
  }
}

async function handleOsuLogout(client: WebSocket): Promise<void> {
  try {
    const status = await logoutOsu();
    sendJson(client, { type: "ack", received: "osu_logout", status });
  } catch (error) {
    console.error(`[${formatLogTime()}] osu! logout failed: ${(error as Error).message}`);
    sendJson(client, { type: "error", request: "osu_logout", message: "Unable to log out from the osu! API." });
  }
}

async function handleApiRequest(client: WebSocket, message: ClientMessage): Promise<void> {
  const { endpoint } = message as Extract<ClientMessage, { type: "api_request" }>;
  if (!config.allowedApiEndpoints.some((pattern) => pattern.test(endpoint))) {
    sendJson(client, { type: "error", request: "api_request", message: "Endpoint not allowed" });
    return;
  }

  try {
    const accessToken = await getAccessToken();
    const response = await fetchApi(accessToken, endpoint);
    sendJson(client, { type: "api_response", endpoint, response });
  } catch (error) {
    console.error(`[${formatLogTime()}] osu! API request failed: ${(error as Error).message}`);
    const messageText = (error as Error)?.name === "NotAuthenticatedError" ? "You must be logged in to access the osu! API." : (error as Error).message || "Unable to reach the osu! API.";
    sendJson(client, { type: "error", request: "api_request", message: messageText });
  }
}

function handleSendMessage(client: WebSocket, message: ClientMessage): void {
  const { channel, message: msg } = message as Extract<ClientMessage, { type: "send_message" }>;
  try {
    banchoConnection.sendMessage(channel.trim(), msg);
    sendJson(client, { type: "ack", received: message.type });
  } catch (error) {
    sendJson(client, { type: "error", message: (error as Error).message });
  }
}

function handleJoinChannel(client: WebSocket, message: ClientMessage): void {
  const { channel } = message as Extract<ClientMessage, { type: "join_channel" }>;
  try {
    banchoConnection.joinChannel(channel.trim());
    sendJson(client, { type: "ack", received: message.type });
  } catch (error) {
    sendJson(client, { type: "error", message: (error as Error).message });
  }
}

function handleLeaveChannel(client: WebSocket, message: ClientMessage): void {
  const { channel } = message as Extract<ClientMessage, { type: "leave_channel" }>;
  try {
    banchoConnection.leaveChannel(channel.trim());
    sendJson(client, { type: "ack", received: message.type });
  } catch (error) {
    sendJson(client, { type: "error", message: (error as Error).message });
  }
}

function handlePartChannel(client: WebSocket, message: ClientMessage): void {
  const { channel } = message as Extract<ClientMessage, { type: "part_channel" }>;
  try {
    banchoConnection.leaveChannel(channel.trim());
    sendJson(client, { type: "ack", received: message.type });
  } catch (error) {
    sendJson(client, { type: "error", message: (error as Error).message });
  }
}

function handleSetLobbyScore(client: WebSocket, message: ClientMessage): void {
  const { channel, teamRedScore, teamBlueScore } = message as Extract<ClientMessage, { type: "set_lobby_score" }>;
  try {
    const state = banchoConnection.getLobbyState(channel.trim());
    const winningScore = getWinningScore(state.bestOf);
    if (winningScore && (teamRedScore > winningScore || teamBlueScore > winningScore)) {
      throw new Error(`Match scores cannot exceed ${winningScore}.`);
    }
    banchoConnection.updateLobbyState(channel.trim(), {
      teamRedScore,
      teamBlueScore,
    });
    sendJson(client, { type: "ack", received: message.type });
  } catch (error) {
    sendJson(client, { type: "error", message: (error as Error).message });
  }
}

function handleSetLobbySettings(client: WebSocket, message: ClientMessage): void {
  const { channel, bestOf, nextPickTeam } = message as Extract<ClientMessage, { type: "set_lobby_settings" }>;
  try {
    banchoConnection.updateLobbyState(channel.trim(), {
      bestOf,
      nextPickTeam,
    });
    sendJson(client, { type: "ack", received: message.type });
  } catch (error) {
    sendJson(client, { type: "error", message: (error as Error).message });
  }
}

function handleClientMessage(client: WebSocket, rawMessage: unknown): void {
  const validationError = validateMessage(rawMessage);
  if (validationError) {
    sendJson(client, { type: "error", message: validationError });
    return;
  }

  const message = rawMessage as ClientMessage;

  const logMessage: Record<string, unknown> = { ...message };
  delete logMessage.password;
  delete logMessage.clientSecret;
  delete logMessage.code;
  console.log(`[${formatLogTime()}] WS ${JSON.stringify(logMessage)}`);

  const handlers: Record<string, (client: WebSocket, message: ClientMessage) => void> = {
    login: handleLogin,
    logout: handleLogout,
    osu_login: handleOsuLogin,
    osu_logout: handleOsuLogout,
    api_request: handleApiRequest,
    send_message: handleSendMessage,
    join_channel: handleJoinChannel,
    leave_channel: handleLeaveChannel,
    part_channel: handlePartChannel,
    set_lobby_score: handleSetLobbyScore,
    set_lobby_settings: handleSetLobbySettings,
  };

  handlers[message.type](client, message);
}

webSocketServer.on("connection", (client) => {
  banchoConnection.addClient(client);

  client.on("message", (data) => {
    let message: unknown;
    try {
      message = JSON.parse(data.toString());
    } catch {
      sendJson(client, {
        type: "error",
        message: "Message must be valid JSON.",
      });
      return;
    }
    handleClientMessage(client, message);
  });

  client.on("close", () => {
    banchoConnection.removeClient(client);
    if (banchoConnection.clients.size === 0) {
      banchoConnection.logout();
    }
  });
});

httpServer.listen(config.httpPort, config.httpHost, () => {
  console.log(`[${formatLogTime()}] WhistleIRC server listening on http://${config.httpHost}:${config.httpPort}`);
  console.log(`[${formatLogTime()}] WebSocket endpoint: ws://${config.httpHost}:${config.httpPort}/ws`);

  const browserUrl = `http://localhost:${config.httpPort}`;

  if (process.platform === "win32") {
    execFile("cmd", ["/c", "start", "", browserUrl], {
      windowsHide: true,
    });
  } else if (process.platform === "darwin") {
    execFile("open", [browserUrl]);
  } else {
    execFile("xdg-open", [browserUrl]);
  }
});

function shutdown(signal?: string): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
    process.stdin.setRawMode(false);
  }
  console.log(`[${formatLogTime()}] Shutting down${signal ? ` (${signal})` : ""}...`);
  banchoConnection.logout();

  for (const client of webSocketServer.clients) {
    client.terminate();
  }

  let pendingClosures = 2;
  const finishClosure = () => {
    pendingClosures -= 1;
    if (pendingClosures === 0) {
      process.exit(0);
    }
  };

  webSocketServer.close(finishClosure);
  if (httpServer.listening) {
    httpServer.close(finishClosure);
  } else {
    finishClosure();
  }

  setTimeout(() => process.exit(0), 1500).unref();
}

if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (data: Buffer) => {
    if (data.includes(0x03)) {
      shutdown("CTRL+C");
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGBREAK", () => shutdown("SIGBREAK"));
