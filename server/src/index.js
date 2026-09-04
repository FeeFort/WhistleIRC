const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { execFile } = require("node:child_process");
const express = require("express");
const { WebSocketServer, WebSocket } = require("ws");
const { parseBanchoBotMessage, parseLobbyCommand } = require("./banchoBotParser");
const { login: loginOsu, logout: logoutOsu } = require("./auth/auth");

const HTTP_HOST = process.env.HOST || "0.0.0.0";
const HTTP_PORT = Number(process.env.PORT || 3000);
const IRC_HOST = "irc.ppy.sh";
const IRC_PORT = 6667;
const AUTH_ERROR = "Login or password is incorrect.";

function formatLogTime(date = new Date()) {
  return date.toTimeString().slice(0, 8);
}

const app = express();
const httpServer = http.createServer(app);
const staticDirectory = path.join(__dirname, "..", "static");
const webSocketServer = new WebSocketServer({
  server: httpServer,
  path: "/ws",
});

app.use(express.static(staticDirectory));

app.get("/", (_request, response) => {
  response.sendFile(path.join(staticDirectory, "index.html"));
});

app.get("/health", (_request, response) => {
  response.status(200).send("ok");
});

function sendJson(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function parseIrcLine(line) {
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

function getNick(prefix) {
  if (!prefix) {
    return null;
  }
  return prefix.split("!", 1)[0];
}

function normalizeChannel(channel) {
  return String(channel || "")
    .replace(/^:/, "")
    .toLowerCase();
}

function getMultiplayerId(channel) {
  const match = normalizeChannel(channel).match(/^#?mp_(\d+)$/);
  return match ? Number(match[1]) : null;
}

function isMultiplayerChannel(channel) {
  return getMultiplayerId(channel) !== null;
}

function getOppositePickTeam(state) {
  if (!state.nextPickTeam || !state.teamRed || !state.teamBlue) return null;
  if (state.nextPickTeam.toLowerCase() === state.teamRed.toLowerCase()) {
    return state.teamBlue;
  }
  if (state.nextPickTeam.toLowerCase() === state.teamBlue.toLowerCase()) {
    return state.teamRed;
  }
  return null;
}

function getWinningScore(bestOf) {
  const value = Number(bestOf);
  return Number.isInteger(value) && value > 0 ? Math.ceil(value / 2) : null;
}

function getMatchStatus(state) {
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

function createLobbyState(channel) {
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

function cloneLobbyState(state) {
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

function sameLobbyValue(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

class BanchoConnection {
  constructor() {
    this.socket = null;
    this.state = "disconnected";
    this.buffer = "";
    this.intentionalClose = false;
    this.credentials = null;
    this.clients = new Set();
    this.lobbyStates = new Map();
    this.matchScoreBuffers = new Map();
    this.pendingAutoSettings = new Set();
  }

  addClient(client) {
    this.clients.add(client);
    this.sendStatus(client);
    for (const [channel, state] of this.lobbyStates) {
      this.sendLobbyState(channel, state, client);
    }
  }

  removeClient(client) {
    this.clients.delete(client);
  }

  broadcast(payload) {
    for (const client of this.clients) {
      sendJson(client, payload);
    }
  }

  sendStatus(client = null, detail = null) {
    const payload = { type: "status", state: this.state };
    if (detail) {
      payload.detail = detail;
    }

    if (client) {
      sendJson(client, payload);
    } else {
      this.broadcast(payload);
    }
  }

  setState(state, detail = null) {
    this.state = state;
    this.sendStatus(null, detail);
  }

  isOwnNick(nick) {
    return Boolean(nick && this.credentials?.login && nick.toLowerCase() === this.credentials.login.toLowerCase());
  }

  getLobbyState(channel, reset = false) {
    const key = normalizeChannel(channel);
    if (!this.lobbyStates.has(key) || reset) {
      this.lobbyStates.set(key, createLobbyState(channel));
      this.matchScoreBuffers.set(key, new Map());
    }
    return this.lobbyStates.get(key);
  }

  sendLobbyState(channel, state = this.lobbyStates.get(normalizeChannel(channel)), client = null) {
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

  updateLobbyState(channel, update) {
    const state = this.getLobbyState(channel);
    let changed = false;

    for (const key of [
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
    ]) {
      if (Object.prototype.hasOwnProperty.call(update, key)) {
        const sameValue =
          key === "activeMods" && typeof state[key] === "string" && typeof update[key] === "string" ? state[key].toLowerCase() === update[key].toLowerCase() : sameLobbyValue(state[key], update[key]);
        if (!sameValue) changed = true;
        state[key] = update[key];
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

  closeLobby(channel) {
    const state = this.getLobbyState(channel);
    const changed = state.status !== "closed" || state.timer.active || state.timer.endsAt !== null;
    state.status = "closed";
    state.timer = { active: false, endsAt: null };
    this.matchScoreBuffers.set(normalizeChannel(channel), new Map());
    if (changed) this.sendLobbyState(channel, state);
  }

  updatePlayers(channel, players) {
    const normalizedPlayers = players.map((player) => ({ ...player }));
    this.updateLobbyState(channel, {
      players: normalizedPlayers,
      teamRedPlayers: normalizedPlayers.filter((player) => player.team === "red").map((player) => player.username),
      teamBluePlayers: normalizedPlayers.filter((player) => player.team === "blue").map((player) => player.username),
    });
  }

  upsertPlayer(channel, player) {
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

  removePlayer(channel, username) {
    const state = this.getLobbyState(channel);
    const players = state.players.filter((player) => player.username.toLowerCase() !== username.toLowerCase());
    if (players.length !== state.players.length) this.updatePlayers(channel, players);
  }

  recordPlayerScore(channel, result) {
    const key = normalizeChannel(channel);
    const scores = this.matchScoreBuffers.get(key) || new Map();
    scores.set(result.username.toLowerCase(), result.score);
    this.matchScoreBuffers.set(key, scores);
  }

  finishMatch(channel) {
    const state = this.getLobbyState(channel);
    const scores = this.matchScoreBuffers.get(normalizeChannel(channel)) || new Map();
    if (!scores.size) return;

    const sumTeam = (players) => players.reduce((total, username) => total + (scores.get(username.toLowerCase()) || 0), 0);
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

  handleLobbyMessage(channel, nick, text) {
    const command = parseLobbyCommand(text);
    if (command) {
      this.updateLobbyState(channel, command.value);
    }

    if (nick?.toLowerCase() !== "banchobot") return;
    const parsed = parseBanchoBotMessage(text);
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

  requestLobbySettings(channel) {
    const key = normalizeChannel(channel);
    this.pendingAutoSettings.add(key);
    try {
      this.sendMessage(channel, "!mp settings");
      console.log(`[${formatLogTime()}] IRC OUT PRIVMSG ${channel} :!mp settings (automatic)`);
    } catch (error) {
      this.pendingAutoSettings.delete(key);
      console.error(`[${formatLogTime()}] IRC OUT PRIVMSG ${channel} :!mp settings failed: ${error.message}`);
    }
  }

  consumeAutoSettings(channel, nick, text) {
    const key = normalizeChannel(channel);
    if (!this.isOwnNick(nick) || !this.pendingAutoSettings.has(key)) {
      return false;
    }
    if (!/^!mp\s+settings(?:\s|$)/i.test(text)) return false;
    this.pendingAutoSettings.delete(key);
    return true;
  }

  connect(login, password) {
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
      this.sendRaw(`PASS ${this.credentials.password}`);
      this.sendRaw(`NICK ${this.credentials.login}`);
      this.sendRaw(`USER ${this.credentials.login} 0 * :${this.credentials.login}`);
    });

    socket.on("data", (chunk) => {
      if (this.socket !== socket) {
        return;
      }
      this.handleData(chunk);
    });

    socket.on("error", (error) => {
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

  handleData(chunk) {
    this.buffer += chunk;
    while (this.buffer.includes("\n")) {
      const lineEnd = this.buffer.indexOf("\n");
      const line = this.buffer.slice(0, lineEnd).replace(/\r$/, "");
      this.buffer = this.buffer.slice(lineEnd + 1);
      this.handleLine(line);
    }
  }

  handleLine(line) {
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
        console.error(`[${formatLogTime()}] IRC OUT ${pong} failed: ${error.message}`);
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

  sendRaw(line) {
    if (!this.socket || this.socket.destroyed) {
      throw new Error("IRC connection is not open.");
    }
    this.socket.write(`${line}\r\n`, "utf8");
  }

  sendMessage(channel, text) {
    this.sendRaw(`PRIVMSG ${channel} :${text}`);
    if (isMultiplayerChannel(channel)) {
      const command = parseLobbyCommand(text);
      if (command) this.updateLobbyState(channel, command.value);
    }
  }

  joinChannel(channel) {
    this.sendRaw(`JOIN ${channel}`);
  }

  leaveChannel(channel) {
    this.sendRaw(`PART ${channel}`);
  }

  logout() {
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

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return "Message must be a JSON object.";
  }

  if (!isNonEmptyString(message.type)) {
    return "Message type must be a non-empty string.";
  }

  const validators = {
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
      if (!Number.isInteger(message.teamRedScore) || message.teamRedScore < 0) {
        return "teamRedScore must be a non-negative integer.";
      }
      if (!Number.isInteger(message.teamBlueScore) || message.teamBlueScore < 0) {
        return "teamBlueScore must be a non-negative integer.";
      }
      return null;
    },
    set_lobby_settings: () => {
      if (!isNonEmptyString(message.channel)) {
        return "channel must be a non-empty string.";
      }
      if (message.bestOf !== null && (!Number.isInteger(message.bestOf) || message.bestOf < 1)) {
        return "bestOf must be null or a positive integer.";
      }
      if (message.nextPickTeam !== null && !isNonEmptyString(message.nextPickTeam)) {
        return "nextPickTeam must be null or a non-empty string.";
      }
      return null;
    },
  };

  if (!validators[message.type]) {
    return `Unknown message type: ${message.type}`;
  }

  return validators[message.type]();
}

function handleLogin(client, message) {
  try {
    banchoConnection.addClient(client);
    banchoConnection.connect(message.login.trim(), message.password);
    sendJson(client, { type: "ack", received: message.type });
  } catch (error) {
    sendJson(client, { type: "error", message: error.message });
  }
}

function handleLogout(client) {
  banchoConnection.logout();
  sendJson(client, { type: "ack", received: "logout" });
}

async function handleOsuLogin(client, message) {
  try {
    const user = await loginOsu({ clientId: message.clientId.trim(), clientSecret: message.clientSecret, redirectUri: message.redirectUri.trim() }, message.code.trim());
    sendJson(client, { type: "osu_user", user });
  } catch (error) {
    console.error(`[${formatLogTime()}] osu! OAuth request failed: ${error.message}`);
    sendJson(client, { type: "error", request: "osu_login", message: error.message || "Unable to reach the osu! API." });
  }
}

async function handleOsuLogout(client) {
  try {
    await logoutOsu();
    sendJson(client, { type: "ack", received: "osu_logout" });
  } catch (error) {
    console.error(`[${formatLogTime()}] osu! logout failed: ${error.message}`);
    sendJson(client, { type: "error", request: "osu_logout", message: "Unable to log out from the osu! API." });
  }
}

function handleSendMessage(client, message) {
  try {
    banchoConnection.sendMessage(message.channel.trim(), message.message);
    sendJson(client, { type: "ack", received: message.type });
  } catch (error) {
    sendJson(client, { type: "error", message: error.message });
  }
}

function handleJoinChannel(client, message) {
  try {
    banchoConnection.joinChannel(message.channel.trim());
    sendJson(client, { type: "ack", received: message.type });
  } catch (error) {
    sendJson(client, { type: "error", message: error.message });
  }
}

function handleLeaveChannel(client, message) {
  try {
    banchoConnection.leaveChannel(message.channel.trim());
    sendJson(client, { type: "ack", received: message.type });
  } catch (error) {
    sendJson(client, { type: "error", message: error.message });
  }
}

function handlePartChannel(client, message) {
  try {
    banchoConnection.leaveChannel(message.channel.trim());
    sendJson(client, { type: "ack", received: message.type });
  } catch (error) {
    sendJson(client, { type: "error", message: error.message });
  }
}

function handleSetLobbyScore(client, message) {
  try {
    const state = banchoConnection.getLobbyState(message.channel.trim());
    const winningScore = getWinningScore(state.bestOf);
    if (winningScore && (message.teamRedScore > winningScore || message.teamBlueScore > winningScore)) {
      throw new Error(`Match scores cannot exceed ${winningScore}.`);
    }
    banchoConnection.updateLobbyState(message.channel.trim(), {
      teamRedScore: message.teamRedScore,
      teamBlueScore: message.teamBlueScore,
    });
    sendJson(client, { type: "ack", received: message.type });
  } catch (error) {
    sendJson(client, { type: "error", message: error.message });
  }
}

function handleSetLobbySettings(client, message) {
  try {
    banchoConnection.updateLobbyState(message.channel.trim(), {
      bestOf: message.bestOf,
      nextPickTeam: message.nextPickTeam,
    });
    sendJson(client, { type: "ack", received: message.type });
  } catch (error) {
    sendJson(client, { type: "error", message: error.message });
  }
}

function handleClientMessage(client, message) {
  const validationError = validateMessage(message);
  if (validationError) {
    sendJson(client, { type: "error", message: validationError });
    return;
  }

  const logMessage = { ...message };
  delete logMessage.password;
  delete logMessage.clientSecret;
  delete logMessage.code;
  console.log(`[${formatLogTime()}] WS ${JSON.stringify(logMessage)}`);

  const handlers = {
    login: handleLogin,
    logout: handleLogout,
    osu_login: handleOsuLogin,
    osu_logout: handleOsuLogout,
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
    let message;
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

httpServer.listen(HTTP_PORT, HTTP_HOST, () => {
  console.log(`[${formatLogTime()}] WhistleIRC server listening on http://${HTTP_HOST}:${HTTP_PORT}`);
  console.log(`[${formatLogTime()}] WebSocket endpoint: ws://${HTTP_HOST}:${HTTP_PORT}/ws`);

  const browserUrl = `http://localhost:${HTTP_PORT}`;

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

function shutdown(signal) {
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
  process.stdin.on("data", (data) => {
    if (data.includes(0x03)) {
      shutdown("CTRL+C");
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGBREAK", () => shutdown("SIGBREAK"));
