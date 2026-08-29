<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import Button from "primevue/button";
import ColorPicker from "primevue/colorpicker";
import InputText from "primevue/inputtext";
import SelectButton from "primevue/selectbutton";
import Toast from "primevue/toast";
import ToggleSwitch from "primevue/toggleswitch";
import { useToast } from "primevue/usetoast";
import { ArrowLeft, Check, CircleX, DoorOpen, Map, RotateCcw, Settings2 } from "@lucide/vue";
import ChatWindow from "./components/ChatWindow.vue";
import AddChannelDialog from "./components/AddChannelDialog.vue";
import CreateLobbyDialog from "./components/CreateLobbyDialog.vue";
import LoginPage from "./components/LoginPage.vue";
import LobbyScoreCard from "./components/LobbyScoreCard.vue";
import LobbyMessagesSettings from "./components/LobbyMessagesSettings.vue";
import MappoolCard from "./components/MappoolCard.vue";
import PlayerListCard from "./components/PlayerListCard.vue";
import AppSidebar from "./components/AppSidebar.vue";
import SidebarSectionCard from "./components/SidebarSectionCard.vue";
import { DEFAULT_PRIMARY_COLOR, useDarkMode } from "./composables/useDarkMode";
import { DEFAULT_CHAT_SETTINGS, useChatSettings } from "./composables/useChatSettings";
import { useNickColor } from "./composables/useNickColor";
import { clearRememberedCredentials, loadRememberedCredentials, loadOsuAuthData, saveRememberedCredentials, saveOsuAuthData } from "./composables/useRememberedCredentials";
import { completeOsuAuthorization, readOsuAuthorizationCallback, startOsuAuthorization } from "./composables/useOsuOAuth";
import { useServerConnection } from "./composables/useServerConnection";
import { formatLobbyTemplate, useLobbyMessages } from "./composables/useLobbyMessages";
import { useMappool } from "./composables/useMappool";

const commandScrollToken = ref(0);
const savedLogin = localStorage.getItem("feeirc-remembered-login") || "";
const currentUser = ref("");
const refereeUser = computed(() => currentUser.value);
const isAuthenticated = ref(false);
const authLoading = ref(true);
const loginLoading = ref(false);
const osuLoading = ref(false);
const osuError = ref("");
const osuClientId = ref("");
const osuClientSecret = ref("");
const osuProfile = ref(null);
const sidebarOpen = ref(true);
const settingsOpen = ref(false);
const lobbyMessagesSettingsOpen = ref(false);
const createLobbyDialogOpen = ref(false);
const addChannelDialogOpen = ref(false);
const activeChat = ref("bancho");
const unreadChats = reactive({ bancho: false });
const joinedChannels = ref([]);
const lobbyStates = reactive({});
const channelMessages = reactive({});
const pendingPartChannels = new Set();
const pendingLobbySeed = ref(null);
const pendingLobbyCreatedViaApp = ref(false);
const pendingJoinChannel = ref(null);
let pendingJoinTimeout;
const { primaryColor, setPrimaryColor } = useDarkMode();
const { highlightReferee, highlightBanchoBot, banchoBotColor, redTeamColor, blueTeamColor, unassignedColorMode, unassignedColor, timestampMode } = useChatSettings();
const { nickColor: baseNickColor } = useNickColor();
const {
  state: serverState,
  lastEvent,
  login: loginToServer,
  logout: logoutFromServer,
  sendMessage: sendServerMessage,
  joinChannel: joinServerChannel,
  partChannel: partServerChannel,
  setLobbyScore,
  setLobbySettings,
} = useServerConnection();
const connected = computed(() => serverState.value === "ready");
const toast = useToast();
const loginToastGroup = "irc-login";
const { activePreset } = useLobbyMessages();
const { qualificationMode } = useMappool();
const primaryColorDraft = ref(primaryColor.value);
const banchoBotColorDraft = ref(banchoBotColor.value);
const redTeamColorDraft = ref(redTeamColor.value);
const blueTeamColorDraft = ref(blueTeamColor.value);
const unassignedColorDraft = ref(unassignedColor.value);

const unassignedColorModes = [
  { label: "Random", value: "random" },
  { label: "Custom", value: "custom" },
];
const timestampModes = [
  { label: "Minutes", value: "minutes" },
  { label: "Full", value: "full" },
];

const chatPreviewMessages = [
  {
    id: 1,
    time: "12:04:18",
    author: "red_player",
    team: "red",
    text: "Ready for the match.",
  },
  {
    id: 2,
    time: "12:04:24",
    author: "blue_player",
    team: "blue",
    text: "Good luck, have fun!",
  },
  {
    id: 3,
    time: "12:04:31",
    author: "referee",
    role: "referee",
    text: "Starting in a moment.",
  },
  {
    id: 4,
    time: "12:04:36",
    author: "solo_player",
    text: "All set here.",
  },
  {
    id: 5,
    time: "12:05:02",
    author: "BanchoBot",
    text: "Match settings synced.",
  },
];

const primaryColorPicker = computed({
  get: () => primaryColor.value.replace("#", ""),
  set: (value) => {
    const normalized = `#${String(value).replace("#", "")}`;
    if (/^#[0-9a-f]{6}$/i.test(normalized)) setPrimaryColor(normalized);
  },
});

const primaryColorChanged = computed(() => primaryColor.value.toLowerCase() !== DEFAULT_PRIMARY_COLOR);

const redTeamColorPicker = computed({
  get: () => redTeamColor.value.replace("#", ""),
  set: (value) => updateChatColor(redTeamColor, value),
});

const banchoBotColorPicker = computed({
  get: () => banchoBotColor.value.replace("#", ""),
  set: (value) => updateChatColor(banchoBotColor, value),
});

const blueTeamColorPicker = computed({
  get: () => blueTeamColor.value.replace("#", ""),
  set: (value) => updateChatColor(blueTeamColor, value),
});

const unassignedColorPicker = computed({
  get: () => unassignedColor.value.replace("#", ""),
  set: (value) => updateChatColor(unassignedColor, value),
});

const chatSettingChanged = computed(() => ({
  banchoBotColor: banchoBotColor.value.toLowerCase() !== DEFAULT_CHAT_SETTINGS.banchoBotColor,
  redTeamColor: redTeamColor.value.toLowerCase() !== DEFAULT_CHAT_SETTINGS.redTeamColor,
  blueTeamColor: blueTeamColor.value.toLowerCase() !== DEFAULT_CHAT_SETTINGS.blueTeamColor,
  unassignedColor: unassignedColor.value.toLowerCase() !== DEFAULT_CHAT_SETTINGS.unassignedColor,
}));

watch(
  lastEvent,
  (event) => {
    if (event?.type === "lobby_state") {
      applyLobbyState(event);
      return;
    }

    if (event?.type === "channel_joined") {
      const channel = addJoinedChannel(event.channel);
      const joinedChannelId = channelId(event.channel);
      if (pendingJoinChannel.value?.id === joinedChannelId && normalizeIrcNick(event.nick) === normalizeIrcNick(currentUser.value)) {
        clearPendingJoin();
        activeChat.value = joinedChannelId;
        addChannelDialogOpen.value = false;
        showJoinToast("success", "Connected", "Successfully joined the lobby.");
      }
      if (channel && pendingLobbySeed.value && normalizeIrcNick(event.nick) === normalizeIrcNick(currentUser.value)) {
        channel.createdViaCreateLobby = pendingLobbyCreatedViaApp.value;
        const seededLobby = {
          ...channel.lobby,
          ...pendingLobbySeed.value,
        };
        channel.lobby = seededLobby;
        lobbyStates[channel.id] = seededLobby;
        if (Number.isInteger(seededLobby.bestOf) && seededLobby.bestOf > 0) {
          setLobbySettings(channel.label, seededLobby.bestOf, seededLobby.nextPickTeam);
        }
        pendingLobbySeed.value = null;
        pendingLobbyCreatedViaApp.value = false;
      }
      return;
    }

    if (event?.type === "irc_event" && pendingJoinChannel.value && ["403", "471", "473", "474", "475", "482"].includes(event.command)) {
      const mentionsPendingChannel = event.params?.some((param) => channelId(param) === pendingJoinChannel.value.id);
      if (mentionsPendingChannel) {
        failPendingJoin();
        return;
      }
    }

    if (event?.type === "channel_parted") {
      const partedChannelId = channelId(event.channel);
      if (pendingPartChannels.delete(partedChannelId)) return;

      const joinedChannel = joinedChannels.value.find((channel) => channel.id === partedChannelId);
      if (!joinedChannel || normalizeIrcNick(event.nick) !== normalizeIrcNick(currentUser.value)) {
        return;
      }

      markRoomClosed(partedChannelId);
      return;
    }

    if (event?.type !== "message" || !event.channel || !event.text) return;

    if (event.nick === "BanchoBot") {
      const joinedChannel = joinedChannels.value.find((channel) => channel.id === channelId(event.channel));
      if (joinedChannel && /(?:!mp\s+close|room\s+(?:has been\s+)?closed|lobby\s+(?:has been\s+)?closed)/i.test(event.text)) {
        markRoomClosed(joinedChannel.id);
      }
    }

    const joinedChannel = joinedChannels.value.find((channel) => channel.id === channelId(event.channel));
    const chatId = event.channel === "BanchoBot" ? "bancho" : joinedChannel?.id;
    if (!chatId) {
      return;
    }

    if (joinedChannel && event.nick?.toLowerCase() === "banchobot") {
      applyRefereeConfirmation(joinedChannel, event.text);
    }

    const player = joinedChannel?.lobby?.players?.find((item) => normalizeIrcNick(item.username) === normalizeIrcNick(event.nick));

    appendChatMessage(chatId, {
      id: nextId++,
      author: event.nick || "Unknown",
      text: event.text,
      time: event.timestamp,
      team: player?.team || null,
      mods: player?.mods || [],
    });
  },
  { flush: "sync" },
);

watch(primaryColor, (value) => {
  primaryColorDraft.value = value;
});

watch([banchoBotColor, redTeamColor, blueTeamColor, unassignedColor], ([bot, red, blue, unassigned]) => {
  banchoBotColorDraft.value = bot;
  redTeamColorDraft.value = red;
  blueTeamColorDraft.value = blue;
  unassignedColorDraft.value = unassigned;
});

function commitPrimaryColor() {
  if (/^#[0-9a-f]{6}$/i.test(primaryColorDraft.value.trim())) {
    setPrimaryColor(primaryColorDraft.value.trim());
  } else {
    primaryColorDraft.value = primaryColor.value;
  }
}

function resetPrimaryColor() {
  setPrimaryColor(DEFAULT_PRIMARY_COLOR);
}

function updateChatColor(target, value) {
  const normalized = `#${String(value).replace("#", "")}`;
  if (/^#[0-9a-f]{6}$/i.test(normalized)) target.value = normalized;
}

function commitChatColor(target, draft) {
  if (/^#[0-9a-f]{6}$/i.test(draft.value.trim())) {
    target.value = draft.value.trim();
  } else {
    draft.value = target.value;
  }
}

function resetChatSetting(setting) {
  if (setting === "highlightReferee") {
    highlightReferee.value = DEFAULT_CHAT_SETTINGS.highlightReferee;
  } else if (setting === "redTeamColor") {
    redTeamColor.value = DEFAULT_CHAT_SETTINGS.redTeamColor;
  } else if (setting === "blueTeamColor") {
    blueTeamColor.value = DEFAULT_CHAT_SETTINGS.blueTeamColor;
  } else if (setting === "unassignedColor") {
    unassignedColorMode.value = DEFAULT_CHAT_SETTINGS.unassignedColorMode;
    unassignedColor.value = DEFAULT_CHAT_SETTINGS.unassignedColor;
  } else if (setting === "banchoBotColor") {
    banchoBotColor.value = DEFAULT_CHAT_SETTINGS.banchoBotColor;
  } else if (setting === "timestampMode") {
    timestampMode.value = DEFAULT_CHAT_SETTINGS.timestampMode;
  }
}

function previewNickStyle(message) {
  if (message.author === "BanchoBot" && highlightBanchoBot.value) {
    return {
      background: banchoBotColor.value,
      color: "var(--app-bg)",
    };
  }
  if (message.author === "BanchoBot") {
    return { color: banchoBotColor.value };
  }
  if (message.role === "referee") {
    if (highlightReferee.value) {
      return {
        background: "var(--app-primary-dark)",
        color: "var(--app-bg)",
      };
    }
    return { color: "var(--app-primary)" };
  }

  if (message.team?.toLowerCase() === "red") {
    return { color: redTeamColor.value };
  }
  if (message.team?.toLowerCase() === "blue") {
    return { color: blueTeamColor.value };
  }
  if (unassignedColorMode.value === "custom") {
    return { color: unassignedColor.value };
  }
  return { color: baseNickColor(message.author) };
}

function previewTime(time, index) {
  if (timestampMode.value === "full") return time;
  const minute = time.slice(0, 5);
  const previousMinute = chatPreviewMessages[index - 1]?.time.slice(0, 5);
  return index === 0 || minute !== previousMinute ? minute : "";
}

function handleLogout() {
  pendingPartChannels.clear();
  pendingLobbySeed.value = null;
  pendingLobbyCreatedViaApp.value = false;
  clearPendingJoin();
  joinedChannels.value = [];
  Object.keys(channelMessages).forEach((channelIdValue) => {
    delete channelMessages[channelIdValue];
  });
  Object.keys(lobbyStates).forEach((channelIdValue) => {
    delete lobbyStates[channelIdValue];
  });
  Object.keys(unreadChats).forEach((chatId) => {
    if (chatId !== "bancho") delete unreadChats[chatId];
  });
  activeChat.value = "bancho";
  logoutFromServer();
  void clearRememberedCredentials();
  currentUser.value = "";
  isAuthenticated.value = false;
  settingsOpen.value = false;
  localStorage.removeItem("feeirc-remembered-login");
}

async function connectWithToast(username, password) {
  toast.removeGroup(loginToastGroup);
  toast.add({
    group: loginToastGroup,
    severity: "info",
    summary: "Connecting",
    detail: "Connecting to Bancho IRC...",
    sticky: true,
  });

  try {
    await loginToServer(username, password);
    toast.removeGroup(loginToastGroup);
    toast.add({
      group: loginToastGroup,
      severity: "success",
      summary: "Connected",
      detail: "Bancho IRC connection is ready.",
      life: 3000,
    });
    return true;
  } catch (error) {
    toast.removeGroup(loginToastGroup);
    toast.add({
      group: loginToastGroup,
      severity: "error",
      summary: "Connection failed",
      detail: error.message || "Unable to connect to Bancho IRC.",
      life: 5000,
    });
    return false;
  }
}

async function handleLogin({ username, password, rememberMe }) {
  if (loginLoading.value) return;
  loginLoading.value = true;
  const connectedSuccessfully = await connectWithToast(username, password);

  if (connectedSuccessfully) {
    if (rememberMe) {
      void saveRememberedCredentials(username, password).catch(() => {});
      localStorage.setItem("feeirc-remembered-login", username);
    } else {
      void clearRememberedCredentials();
      localStorage.removeItem("feeirc-remembered-login");
    }
    currentUser.value = username;
    isAuthenticated.value = true;
  }
  loginLoading.value = false;
}

async function handleOsuCredentials({ clientId, clientSecret }) {
  osuClientId.value = clientId;
  osuClientSecret.value = clientSecret;
  osuError.value = "";

  try {
    const existingAuth = (await loadOsuAuthData()) || {};
    await saveOsuAuthData({
      ...existingAuth,
      clientId,
      clientSecret,
    });
  } catch {
    osuError.value = "Unable to save osu! credentials in this browser.";
  }
}

async function handleOsuLogin({ clientId, clientSecret }) {
  await handleOsuCredentials({ clientId, clientSecret });
  if (osuError.value) return;

  osuLoading.value = true;
  osuError.value = "";
  startOsuAuthorization(clientId);
}

async function handleOsuLogout() {
  osuProfile.value = null;
  osuError.value = "";
  await saveOsuAuthData({
    clientId: osuClientId.value,
    clientSecret: osuClientSecret.value,
  });
  await clearRememberedCredentials();
  localStorage.removeItem("feeirc-remembered-login");
}

function handleCopyCallback() {
  toast.removeGroup(loginToastGroup);
  toast.add({
    group: loginToastGroup,
    severity: "success",
    summary: "Copied",
    detail: "Callback URL copied to clipboard.",
    life: 2500,
  });
}

onMounted(async () => {
  const [credentials, osuAuth] = await Promise.all([loadRememberedCredentials(), loadOsuAuthData()]);
  osuClientId.value = osuAuth?.clientId || "";
  osuClientSecret.value = osuAuth?.clientSecret || "";
  osuProfile.value = osuAuth?.user || null;

  try {
    const callback = readOsuAuthorizationCallback();
    if (callback) {
      if (!osuClientId.value || !osuClientSecret.value) {
        throw new Error("Enter your osu! OAuth credentials first.");
      }

      osuLoading.value = true;
      const authData = await completeOsuAuthorization({
        clientId: osuClientId.value,
        clientSecret: osuClientSecret.value,
        code: callback.code,
      });
      await saveOsuAuthData({
        ...authData,
        clientId: osuClientId.value,
        clientSecret: osuClientSecret.value,
      });
      osuProfile.value = authData.user;
    }
  } catch (error) {
    osuError.value = error.message || "Unable to log in from osu!.";
  } finally {
    osuLoading.value = false;
  }

  if (credentials?.login && credentials?.password) {
    const connectedSuccessfully = await connectWithToast(credentials.login, credentials.password);
    if (connectedSuccessfully) {
      currentUser.value = credentials.login;
      isAuthenticated.value = true;
    }
  }
  authLoading.value = false;
});

function handlePageExit() {
  logoutFromServer();
}

onMounted(() => {
  window.addEventListener("pagehide", handlePageExit);
  window.addEventListener("beforeunload", handlePageExit);
});

onBeforeUnmount(() => {
  window.removeEventListener("pagehide", handlePageExit);
  window.removeEventListener("beforeunload", handlePageExit);
});

function openSettings() {
  settingsOpen.value = true;
}

function closeSettings() {
  settingsOpen.value = false;
}

const banchoMessages = ref([
  {
    id: 1,
    type: "system",
    text: "Welcome to WhistleIRC!",
  },
]);
const roomClosedByChat = reactive({});

const activeMessages = computed(() => (activeChat.value === "bancho" ? banchoMessages.value : channelMessages[activeChat.value] || []));
const activeChatTitle = computed(() => {
  if (activeChat.value === "bancho") return "BanchoBot";
  const channel = joinedChannels.value.find((item) => item.id === activeChat.value);
  return channel?.lobby?.name || channel?.label || activeChat.value;
});
watch(
  [isAuthenticated, settingsOpen, activeChatTitle],
  ([authenticated, settingsVisible, title]) => {
    document.title = authenticated && !settingsVisible && title ? `WhistleIRC — ${title}` : "WhistleIRC";
  },
  { immediate: true },
);
const isBanchoChat = computed(() => activeChat.value === "bancho");
const activeChannel = computed(() => {
  if (isBanchoChat.value) return null;
  return joinedChannels.value.find((item) => item.id === activeChat.value);
});
const activeLobbyState = computed(() => {
  if (isBanchoChat.value) return null;
  return lobbyStates[activeChat.value];
});
const showQualificationToggle = computed(() => Boolean(activeChannel.value) && !activeChannel.value.createdViaCreateLobby);
const activeLobbySize = computed(() => activeLobbyState.value?.size ?? 16);
const activeLobbyTeamMode = computed(() => activeLobbyState.value?.teamMode || "HeadToHead");
const activeLobbyScoreMode = computed(() => activeLobbyState.value?.scoreMode || "Score");
const activeLobbyTeamAScore = computed({
  get: () => activeLobbyState.value?.teamRedScore ?? 0,
  set: (value) => updateActiveLobbyScore("teamRedScore", value),
});
const activeLobbyTeamBScore = computed({
  get: () => activeLobbyState.value?.teamBlueScore ?? 0,
  set: (value) => updateActiveLobbyScore("teamBlueScore", value),
});
const activeLobbyPlayers = computed(() => {
  const lobby = activeLobbyState.value;
  if (!lobby?.players) return [];
  const commonMods = lobby.activeMods
    ? lobby.activeMods
        .split(/\s*,\s*/)
        .map((mod) => mod.trim())
        .filter((mod) => mod && !/^freemod$/i.test(mod))
    : [];
  return lobby.players.map((player) => ({
    name: player.username,
    isHost: false,
    isReady: Boolean(player.ready),
    avatarUrl: player.avatarUrl || (player.userId ? `https://a.ppy.sh/${player.userId}` : ""),
    team: player.team || null,
    mods: [...commonMods, ...(player.mods || [])].filter((mod, index, mods) => mods.findIndex((candidate) => candidate.toLowerCase() === mod.toLowerCase()) === index),
  }));
});
const activeLobbyReferees = computed(() => {
  const channel = joinedChannels.value.find((item) => item.id === activeChat.value);
  if (Array.isArray(channel?.referees)) {
    return channel.referees;
  }
  return currentUser.value ? [currentUser.value] : [];
});
const lobbyClock = ref(Date.now());
const activeLobbyTimerSeconds = computed(() => {
  const timer = activeLobbyState.value?.timer;
  if (!timer?.active || !timer.endsAt) return 0;
  return Math.max(0, Math.ceil((timer.endsAt - lobbyClock.value) / 1000));
});
const activeLobbyTimer = computed(() => activeLobbyTimerSeconds.value > 0 && Boolean(activeLobbyState.value));
let lobbyClockInterval;
onMounted(() => {
  lobbyClockInterval = window.setInterval(() => {
    lobbyClock.value = Date.now();
  }, 1000);
});
onBeforeUnmount(() => {
  window.clearInterval(lobbyClockInterval);
});

let nextId = 4;

function normalizeChannel(channel) {
  return String(channel || "")
    .replace(/^:/, "")
    .toLowerCase();
}

function normalizeIrcNick(nick) {
  return normalizeChannel(nick).replaceAll(" ", "_");
}

function channelId(channel) {
  const normalizedChannel = normalizeChannel(channel);
  const multiplayerMatch = normalizedChannel.match(/^#?mp_(\d+)$/);
  return multiplayerMatch ? `mp-${multiplayerMatch[1]}` : normalizedChannel;
}

function createDefaultLobbyState(channelName) {
  const normalizedChannel = normalizeChannel(channelName);
  const match = normalizedChannel.match(/^#?mp_(\d+)$/);
  return {
    id: match ? Number(match[1]) : null,
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

function addJoinedChannel(channelName) {
  const normalizedChannel = normalizeChannel(channelName);
  if (!normalizedChannel) return;

  const existingChannel = joinedChannels.value.find((channel) => channel.id === channelId(channelName));
  if (existingChannel) return existingChannel;

  const channel = {
    id: channelId(channelName),
    label: channelName.replace(/^:/, ""),
    source: "irc",
    createdViaCreateLobby: false,
    lobby: createDefaultLobbyState(channelName),
    referees: currentUser.value ? [currentUser.value] : [],
  };
  joinedChannels.value.push(channel);
  lobbyStates[channel.id] = channel.lobby;
  channelMessages[channel.id] = [];
  unreadChats[channel.id] = false;
  return channel;
}

function applyLobbyState(event) {
  if (!event.channel || !event.state) return;
  const eventChannelId = channelId(event.channel);
  const existingChannel = joinedChannels.value.find((item) => item.id === eventChannelId);
  if (!existingChannel && pendingPartChannels.has(eventChannelId)) return;

  const channel = existingChannel || addJoinedChannel(event.channel);
  if (!channel) return;
  const currentLobby = channel.lobby || createDefaultLobbyState(event.channel);
  const incomingLobby = { ...event.state };
  delete incomingLobby.referees;

  const nextLobby = {
    ...createDefaultLobbyState(event.channel),
    ...currentLobby,
    ...incomingLobby,
    name: incomingLobby.name || currentLobby.name,
    teamRed: incomingLobby.teamRed || currentLobby.teamRed,
    teamBlue: incomingLobby.teamBlue || currentLobby.teamBlue,
    qualifiers: incomingLobby.name ? incomingLobby.qualifiers : currentLobby.qualifiers,
    timer: {
      ...currentLobby.timer,
      ...incomingLobby.timer,
    },
    lastPlay: {
      ...currentLobby.lastPlay,
      ...incomingLobby.lastPlay,
    },
    currentBeatmap: incomingLobby.currentBeatmap ? { ...incomingLobby.currentBeatmap } : currentLobby.currentBeatmap,
    teamRedPlayers: Array.isArray(incomingLobby.teamRedPlayers) ? [...incomingLobby.teamRedPlayers] : currentLobby.teamRedPlayers,
    teamBluePlayers: Array.isArray(incomingLobby.teamBluePlayers) ? [...incomingLobby.teamBluePlayers] : currentLobby.teamBluePlayers,
    players: Array.isArray(incomingLobby.players) ? incomingLobby.players.map((player) => ({ ...player })) : currentLobby.players,
  };
  channel.lobby = nextLobby;
  lobbyStates[eventChannelId] = nextLobby;
  channel.closed = channel.lobby.status === "closed";

  if (channel.closed) {
    markRoomClosed(channel.id);
  } else {
    delete roomClosedByChat[channel.id];
  }
}

function updateActiveLobbyScore(field, value) {
  const channel = joinedChannels.value.find((item) => item.id === activeChat.value);
  if (!channel?.lobby) return;

  const score = Math.max(0, Number.parseInt(value, 10) || 0);
  if (channel.lobby[field] === score) return;
  channel.lobby[field] = score;
  channel.lobby.matchStatus = getMatchStatus(channel.lobby, channel.lobby.teamRed || "Team A", channel.lobby.teamBlue || "Team B");
  setLobbyScore(channel.label, channel.lobby.teamRedScore, channel.lobby.teamBlueScore);
}

function updateActiveLobbySettings(settings) {
  const channel = joinedChannels.value.find((item) => item.id === activeChat.value);
  if (!channel?.lobby) return;

  const bestOf = Number.isInteger(settings.bestOf) && settings.bestOf > 0 ? settings.bestOf : null;
  const nextPickTeam = settings.nextPickTeam || null;
  channel.lobby.bestOf = bestOf;
  channel.lobby.nextPickTeam = nextPickTeam;
  channel.lobby.matchStatus = getMatchStatus(channel.lobby, channel.lobby.teamRed || "Team A", channel.lobby.teamBlue || "Team B");
  setLobbySettings(channel.label, bestOf, nextPickTeam);
}

function applyRefereeConfirmation(channel, text) {
  const added = text.match(/^Added\s+(.+?)\s+to the match referees\.?$/i);
  const removed = text.match(/^Removed\s+(.+?)\s+from the match referees\.?$/i);
  if (!added && !removed) return;

  const action = added ? "add" : "remove";
  const nickname = (added || removed)[1].trim();
  const referees = Array.isArray(channel.referees) ? channel.referees : currentUser.value ? [currentUser.value] : [];
  const normalizedNickname = normalizeIrcNick(nickname);

  if (action === "add") {
    if (referees.some((referee) => normalizeIrcNick(referee) === normalizedNickname)) {
      return;
    }
    channel.referees = [...referees, nickname];
    return;
  }

  channel.referees = referees.filter((referee) => normalizeIrcNick(referee) !== normalizedNickname);
}

function removeJoinedChannel(channelName) {
  const normalizedChannel = normalizeChannel(channelName);
  const channel = joinedChannels.value.find((item) => item.id === channelId(channelName));
  if (!channel) return;

  if (activeChat.value === channel.id) activeChat.value = "bancho";
  joinedChannels.value = joinedChannels.value.filter((item) => item.id !== channel.id);
  delete channelMessages[channel.id];
  delete unreadChats[channel.id];
  delete lobbyStates[channel.id];
}

function selectChat(chatId) {
  activeChat.value = chatId;
  unreadChats[chatId] = false;
  settingsOpen.value = false;
}

function appendChatMessage(chatId, message) {
  const list = chatId === "bancho" ? banchoMessages.value : (channelMessages[chatId] ||= []);
  list.push(message);
  if (activeChat.value !== chatId) unreadChats[chatId] = true;
}

function markRoomClosed(chatId) {
  if (roomClosedByChat[chatId]) return;
  roomClosedByChat[chatId] = true;
  const channel = joinedChannels.value.find((item) => item.id === chatId);
  if (channel) {
    channel.closed = true;
    if (channel.lobby) channel.lobby.status = "closed";
  }
  appendChatMessage(chatId, {
    id: nextId++,
    type: "system",
    text: "Room closed",
  });
}

function joinChannel(channel) {
  const label = channel.label || channel.id;
  const joinedChannelId = channelId(label);
  if (!joinedChannelId || pendingJoinChannel.value) return;

  const existingChannel = joinedChannels.value.find((item) => item.id === joinedChannelId);
  if (existingChannel) {
    activeChat.value = existingChannel.id;
    addChannelDialogOpen.value = false;
    return;
  }

  pendingJoinChannel.value = { id: joinedChannelId, label };
  showJoinToast("info", "Connecting", "Joining the multiplayer lobby...");
  const sent = joinServerChannel(label);
  if (!sent) {
    failPendingJoin("Unable to send the join request. Please reconnect and try again.");
    return;
  }
  pendingJoinTimeout = window.setTimeout(() => {
    failPendingJoin();
  }, 10000);
}

function showJoinToast(severity, summary, detail) {
  toast.removeGroup(loginToastGroup);
  toast.add({
    group: loginToastGroup,
    severity,
    summary,
    detail,
    ...(severity === "info" ? { sticky: true } : { life: 5000 }),
  });
}

function clearPendingJoin() {
  if (pendingJoinTimeout) {
    window.clearTimeout(pendingJoinTimeout);
    pendingJoinTimeout = undefined;
  }
  pendingJoinChannel.value = null;
}

function failPendingJoin(detail = "The lobby does not exist or you are not a referee in it. Please try again or enter another lobby.") {
  clearPendingJoin();
  showJoinToast("error", "Join failed", detail);
}

function requestPartChannel(channelName) {
  const normalizedChannelId = channelId(channelName);
  pendingPartChannels.add(normalizedChannelId);
  const sent = partServerChannel(channelName);
  if (!sent) pendingPartChannels.delete(normalizedChannelId);
  return sent;
}

function closeActiveChat(chatId = activeChat.value) {
  if (chatId === "bancho") return;

  const index = joinedChannels.value.findIndex((channel) => channel.id === chatId);
  const channel = joinedChannels.value[index];
  if (channel) requestPartChannel(channel.label);
  if (index !== -1) joinedChannels.value.splice(index, 1);
  delete channelMessages[chatId];
  delete unreadChats[chatId];
  delete roomClosedByChat[chatId];

  activeChat.value = "bancho";
  unreadChats.bancho = false;
  settingsOpen.value = false;
}

function handleSend(text) {
  const channel = activeChat.value === "bancho" ? "BanchoBot" : joinedChannels.value.find((item) => item.id === activeChat.value)?.label;
  if (!channel) return;
  const resolvedText = activeLobbyState.value ? formatLobbyTemplate(text, getLobbyTemplateValues(activeLobbyState.value)) : text;
  if (!sendServerMessage(channel, resolvedText)) return;
  const lobbyPlayer = activeLobbyState.value?.players?.find((player) => normalizeIrcNick(player.username) === normalizeIrcNick(currentUser.value));
  appendChatMessage(activeChat.value, {
    id: nextId++,
    author: currentUser.value,
    text: resolvedText,
    time: new Date().toISOString(),
    team: lobbyPlayer?.team || null,
  });
}

function handleCommand(command) {
  handleSend(command);
  if (activeChat.value === "bancho") return;
  if (!/^!mp\s+close\b/i.test(command.trim())) return;

  const channel = joinedChannels.value.find((item) => item.id === activeChat.value);
  if (!channel) return;

  markRoomClosed(channel.id);
  requestPartChannel(channel.label);
}

function handleCreateLobby(payload) {
  pendingLobbySeed.value = payload.lobby || null;
  pendingLobbyCreatedViaApp.value = Boolean(payload.lobby);
  if (typeof payload.lobby?.qualificationMode === "boolean") {
    qualificationMode.value = payload.lobby.qualificationMode;
  }
  handleCommand(payload.command);
}

function getMatchStatus(lobby, teamRedName, teamBlueName) {
  const bestOf = Number(lobby.bestOf);
  const winningScore = Number.isInteger(bestOf) && bestOf > 0 ? Math.ceil(bestOf / 2) : null;
  const teamOneScore = Number(lobby.teamRedScore) || 0;
  const teamTwoScore = Number(lobby.teamBlueScore) || 0;

  if (winningScore && teamOneScore >= winningScore && teamOneScore > teamTwoScore) {
    return `${teamRedName} wins the match! GG and WP!`;
  }
  if (winningScore && teamTwoScore >= winningScore && teamTwoScore > teamOneScore) {
    return `${teamBlueName} wins the match! GG and WP!`;
  }
  return lobby.nextPickTeam ? `Next Pick: ${lobby.nextPickTeam}` : "—";
}

function getLobbyTemplateValues(lobby, result = {}) {
  const teamRedName = lobby.teamRed || result.teamAName || "Team A";
  const teamBlueName = lobby.teamBlue || result.teamBName || "Team B";
  const teamRedScore = lobby.teamRedScore ?? 0;
  const teamBlueScore = lobby.teamBlueScore ?? 0;
  const lastPlay = lobby.lastPlay || {};
  const hasLastPlay = Number.isFinite(lastPlay.teamRedScore) && Number.isFinite(lastPlay.teamBlueScore);
  const lastPlayWinnerScore = lastPlay.winnerTeam === "red" ? lastPlay.teamRedScore : lastPlay.teamBlueScore;
  const lastPlayLoserScore = lastPlay.winnerTeam === "red" ? lastPlay.teamBlueScore : lastPlay.teamRedScore;

  return {
    beatmapWinner: !hasLastPlay ? "—" : lastPlay.teamRedScore === lastPlay.teamBlueScore ? "Draw" : lastPlay.teamRedScore > lastPlay.teamBlueScore ? teamRedName : teamBlueName,
    beatmap: lobby.currentBeatmap?.url || "—",
    beatmapTeamRedScore: hasLastPlay ? lastPlay.teamRedScore : "—",
    beatmapTeamBlueScore: hasLastPlay ? lastPlay.teamBlueScore : "—",
    teamRedName,
    teamBlueName,
    matchTeamRedScore: teamRedScore,
    matchTeamBlueScore: teamBlueScore,
    scoreDifference: hasLastPlay ? (Number.isFinite(lastPlay.scoreDifference) ? lastPlay.scoreDifference : lastPlay.winnerTeam ? lastPlayWinnerScore - lastPlayLoserScore : 0) : 0,
    matchStatus: getMatchStatus(lobby, teamRedName, teamBlueName),
    bestOf: lobby.bestOf ?? "—",
  };
}

function handleSendResult(result) {
  if (activeChat.value === "bancho") return;
  const lobby = activeLobbyState.value;
  if (!lobby) return;
  const values = getLobbyTemplateValues(lobby, result);

  const outgoingMessages = activePreset.value?.messages.filter((message) => message.enabled && message.content.trim()) || [
    {
      content: "{{teamRedName}} {{matchTeamRedScore}} - {{matchTeamBlueScore}} {{teamBlueName}}",
    },
  ];

  outgoingMessages.forEach((message) => {
    handleSend(formatLobbyTemplate(message.content, values));
  });
}
</script>

<template>
  <Toast position="top-right" />
  <Toast position="top-right" :group="loginToastGroup">
    <template #messageicon="{ message }">
      <span v-if="message.severity === 'info'" class="login-toast-spinner" aria-label="Loading"></span>
      <Check v-else-if="message.severity === 'success'" :size="18" aria-label="Success" />
      <CircleX v-else-if="message.severity === 'error'" :size="18" aria-label="Error" />
    </template>
  </Toast>
  <LoginPage
    v-if="!isAuthenticated && !authLoading"
    :initial-login="savedLogin"
    :osu-client-id="osuClientId"
    :osu-client-secret="osuClientSecret"
    :osu-profile="osuProfile"
    :osu-loading="osuLoading"
    :osu-error="osuError"
    :loading="loginLoading"
    @login="handleLogin"
    @save-osu-credentials="handleOsuCredentials"
    @osu-login="handleOsuLogin"
    @osu-logout="handleOsuLogout"
    @copy-callback="handleCopyCallback"
  />
  <AppSidebar
    v-if="isAuthenticated"
    v-model:open="sidebarOpen"
    :user-name="currentUser"
    :user-avatar="osuProfile?.avatar || ''"
    :active-chat="activeChat"
    :unread-chats="unreadChats"
    :joined-channels="joinedChannels"
    @logout="handleLogout"
    @open-settings="openSettings"
    @select-chat="selectChat"
    @open-add-channel="addChannelDialogOpen = true"
    @close-chat="closeActiveChat"
  >
    <div v-if="settingsOpen" class="settings-page">
      <header class="settings-page__header">
        <button type="button" class="settings-page__back" aria-label="Back to chat" @click="closeSettings">
          <ArrowLeft :size="18" />
        </button>
        <div class="settings-page__title">
          <Settings2 :size="20" />
          <h1>Settings</h1>
        </div>
      </header>

      <section class="settings-page__section">
        <div class="settings-page__section-heading">
          <h2>App settings</h2>
        </div>

        <div class="settings-page__setting">
          <div class="settings-page__setting-info">
            <h3>Primary color</h3>
            <p>Controls the main accent color used for active states, buttons, highlights, and other interactive elements across the app.</p>
          </div>

          <div class="settings-page__color-control">
            <ColorPicker v-model="primaryColorPicker" inputId="primary-color" />
            <InputText v-model="primaryColorDraft" aria-label="Primary color hex value" spellcheck="false" @blur="commitPrimaryColor" @keydown.enter="commitPrimaryColor" />
            <Button v-if="primaryColorChanged" text size="small" aria-label="Reset primary color" @click="resetPrimaryColor">
              <RotateCcw :size="14" />
              <span>Reset</span>
            </Button>
          </div>
        </div>
      </section>

      <section class="settings-page__section settings-page__section--lobby">
        <div class="settings-page__section-heading">
          <h2>Lobby settings</h2>
        </div>

        <div class="settings-page__setting">
          <div class="settings-page__setting-info">
            <h3>Result messages</h3>
            <p>Choose and customize the messages sent by the Send Result button.</p>
          </div>
          <div class="settings-page__setting-control">
            <Button text size="small" @click="lobbyMessagesSettingsOpen = true">
              <Settings2 :size="14" />
              <span>Set up messages</span>
            </Button>
          </div>
        </div>
      </section>

      <LobbyMessagesSettings v-model:visible="lobbyMessagesSettingsOpen" />

      <section class="settings-page__section settings-page__section--chat">
        <div class="settings-page__section-heading">
          <h2>Chat settings</h2>
        </div>

        <div class="settings-page__chat-preview" aria-label="Chat preview">
          <div v-for="(message, index) in chatPreviewMessages" :key="message.id" class="settings-page__chat-line">
            <span class="settings-page__chat-time">
              {{ previewTime(message.time, index) }}
            </span>
            <span
              class="settings-page__chat-nick"
              :class="{
                'settings-page__chat-nick--badge': (message.role === 'referee' && highlightReferee) || (message.author === 'BanchoBot' && highlightBanchoBot),
              }"
              :style="previewNickStyle(message)"
              >{{ message.author }}</span
            >
            <span class="settings-page__chat-text">{{ message.text }}</span>
          </div>
        </div>

        <div class="settings-page__settings-list">
          <div class="settings-page__setting">
            <div class="settings-page__setting-info">
              <h3>Highlight referee</h3>
              <p>Show the referee name as a filled accent badge in chat.</p>
            </div>
            <div class="settings-page__setting-control">
              <ToggleSwitch v-model="highlightReferee" inputId="highlight-referee" class="app-solid-switch" />
            </div>
          </div>

          <div class="settings-page__setting">
            <div class="settings-page__setting-info">
              <h3>Highlight BanchoBot</h3>
              <p>Show BanchoBot as a filled color badge in chat.</p>
            </div>
            <div class="settings-page__setting-control">
              <ToggleSwitch v-model="highlightBanchoBot" inputId="highlight-bancho-bot" class="app-solid-switch" />
            </div>
          </div>

          <div class="settings-page__setting">
            <div class="settings-page__setting-info">
              <h3>BanchoBot color</h3>
              <p>Color used for the BanchoBot name and highlight badge.</p>
            </div>
            <div class="settings-page__setting-control">
              <ColorPicker v-model="banchoBotColorPicker" />
              <InputText
                v-model="banchoBotColorDraft"
                aria-label="BanchoBot color hex value"
                spellcheck="false"
                @blur="commitChatColor(banchoBotColor, banchoBotColorDraft)"
                @keydown.enter="commitChatColor(banchoBotColor, banchoBotColorDraft)"
              />
              <Button v-if="chatSettingChanged.banchoBotColor" text size="small" aria-label="Reset BanchoBot color" @click="resetChatSetting('banchoBotColor')">
                <RotateCcw :size="14" />
                <span>Reset</span>
              </Button>
            </div>
          </div>

          <div class="settings-page__setting">
            <div class="settings-page__setting-info">
              <h3>Red team color</h3>
              <p>Color used for player names assigned to the red team.</p>
            </div>
            <div class="settings-page__setting-control">
              <ColorPicker v-model="redTeamColorPicker" />
              <InputText
                v-model="redTeamColorDraft"
                aria-label="Red team color hex value"
                spellcheck="false"
                @blur="commitChatColor(redTeamColor, redTeamColorDraft)"
                @keydown.enter="commitChatColor(redTeamColor, redTeamColorDraft)"
              />
              <Button v-if="chatSettingChanged.redTeamColor" text size="small" aria-label="Reset red team color" @click="resetChatSetting('redTeamColor')">
                <RotateCcw :size="14" />
                <span>Reset</span>
              </Button>
            </div>
          </div>

          <div class="settings-page__setting">
            <div class="settings-page__setting-info">
              <h3>Blue team color</h3>
              <p>Color used for player names assigned to the blue team.</p>
            </div>
            <div class="settings-page__setting-control">
              <ColorPicker v-model="blueTeamColorPicker" />
              <InputText
                v-model="blueTeamColorDraft"
                aria-label="Blue team color hex value"
                spellcheck="false"
                @blur="commitChatColor(blueTeamColor, blueTeamColorDraft)"
                @keydown.enter="commitChatColor(blueTeamColor, blueTeamColorDraft)"
              />
              <Button v-if="chatSettingChanged.blueTeamColor" text size="small" aria-label="Reset blue team color" @click="resetChatSetting('blueTeamColor')">
                <RotateCcw :size="14" />
                <span>Reset</span>
              </Button>
            </div>
          </div>

          <div class="settings-page__setting">
            <div class="settings-page__setting-info">
              <h3>Unassigned player color</h3>
              <p>Use a stable random palette color or choose a custom one.</p>
            </div>
            <div class="settings-page__setting-control settings-page__setting-control--wrap">
              <SelectButton v-model="unassignedColorMode" :options="unassignedColorModes" optionLabel="label" optionValue="value" :allowEmpty="false" aria-label="Unassigned player color mode" />
              <template v-if="unassignedColorMode === 'custom'">
                <ColorPicker v-model="unassignedColorPicker" />
                <InputText
                  v-model="unassignedColorDraft"
                  aria-label="Unassigned player color hex value"
                  spellcheck="false"
                  @blur="commitChatColor(unassignedColor, unassignedColorDraft)"
                  @keydown.enter="commitChatColor(unassignedColor, unassignedColorDraft)"
                />
              </template>
              <Button
                v-if="unassignedColorMode === 'custom' && chatSettingChanged.unassignedColor"
                text
                size="small"
                aria-label="Reset unassigned player color"
                @click="resetChatSetting('unassignedColor')"
              >
                <RotateCcw :size="14" />
                <span>Reset</span>
              </Button>
            </div>
          </div>

          <div class="settings-page__setting">
            <div class="settings-page__setting-info">
              <h3>Timestamp format</h3>
              <p>Choose between minute-only and full timestamps in chat.</p>
            </div>
            <div class="settings-page__setting-control">
              <SelectButton v-model="timestampMode" :options="timestampModes" optionLabel="label" optionValue="value" :allowEmpty="false" aria-label="Timestamp format" />
            </div>
          </div>
        </div>
      </section>
    </div>

    <div v-else class="app-layout">
      <ChatWindow
        v-model:qualification-mode="qualificationMode"
        :show-qualification-toggle="showQualificationToggle"
        :title="activeChatTitle"
        :connected="connected"
        :messages="activeMessages"
        :current-user="currentUser"
        :referee-users="activeLobbyReferees"
        :shortcut-mode="isBanchoChat ? 'bancho' : 'referee'"
        :auto-scroll-token="commandScrollToken"
        :room-size="activeLobbySize"
        :room-closed="Boolean(roomClosedByChat[activeChat])"
        :timer-active="activeLobbyTimer"
        :timer-seconds="activeLobbyTimerSeconds"
        :format="activeLobbyTeamMode"
        :win-condition="activeLobbyScoreMode"
        mode="osu"
        @send="handleSend"
        @send-command="handleCommand"
        @create-lobby="createLobbyDialogOpen = true"
        @toggle-sidebar="sidebarOpen = !sidebarOpen"
      />

      <div v-if="!isBanchoChat" class="app-layout__side">
        <SidebarSectionCard title="Lobby" :icon="DoorOpen">
          <LobbyScoreCard
            v-model:team-a-score="activeLobbyTeamAScore"
            v-model:team-b-score="activeLobbyTeamBScore"
            :team-a-name="activeLobbyState?.teamRed || 'Team A'"
            :team-b-name="activeLobbyState?.teamBlue || 'Team B'"
            :best-of="activeLobbyState?.bestOf"
            :next-pick-team="activeLobbyState?.nextPickTeam"
            :can-edit="currentUser === refereeUser"
            :show-match-controls="!qualificationMode"
            :disabled="Boolean(roomClosedByChat[activeChat])"
            :mp-link="activeLobbyState?.id ? `https://osu.ppy.sh/mp/${activeLobbyState.id}` : ''"
            @send-result="handleSendResult"
            @update-settings="updateActiveLobbySettings"
          />
        </SidebarSectionCard>
        <PlayerListCard :players="activeLobbyPlayers" :current-user="currentUser" />
        <SidebarSectionCard title="Mappool" :icon="Map" scrollable>
          <MappoolCard :disabled="Boolean(roomClosedByChat[activeChat])" @send-command="handleCommand" />
        </SidebarSectionCard>
      </div>

      <CreateLobbyDialog v-model:visible="createLobbyDialogOpen" @create="handleCreateLobby" />

      <AddChannelDialog v-model:visible="addChannelDialogOpen" :loading="Boolean(pendingJoinChannel)" @join="joinChannel" />
    </div>
  </AppSidebar>
</template>

<style scoped>
.login-toast-spinner {
  width: 1.1rem;
  height: 1.1rem;
  flex: 0 0 auto;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: login-toast-spin 0.75s linear infinite;
}

@keyframes login-toast-spin {
  to {
    transform: rotate(360deg);
  }
}

.app-layout {
  display: flex;
  gap: 0.9rem;
  height: 100%;
  padding: 1.15rem;
  align-items: stretch;
}

.settings-page {
  height: 100%;
  padding: 1.15rem;
  color: var(--app-text);
}

.settings-page__header {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.35rem 0;
}

.settings-page__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 1px solid var(--app-border);
  border-radius: 0.6rem;
  background: var(--app-control);
  color: var(--app-muted);
  cursor: pointer;
}

.settings-page__back:hover {
  border-color: rgba(var(--app-primary-rgb), 0.28);
  background: rgba(var(--app-primary-rgb), 0.14);
  color: var(--app-primary-bright);
}

.settings-page__title {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.settings-page__title svg {
  color: var(--app-primary-bright);
}

.settings-page__title h1 {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 800;
}

.settings-page__section {
  width: 100%;
  margin-top: 1.8rem;
  color: var(--app-text);
}

.settings-page__section-heading h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
}

.settings-page__setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
  margin-top: 1.25rem;
  padding: 1rem 0;
}

.settings-page__setting-info {
  min-width: 0;
}

.settings-page__setting-info h3 {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 800;
}

.settings-page__setting-info p {
  max-width: 34rem;
  margin: 0.35rem 0 0;
  color: var(--app-muted);
  font-size: 0.76rem;
  line-height: 1.5;
}

.settings-page__color-control {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-shrink: 0;
}

.settings-page__color-control :deep(.p-colorpicker-preview) {
  width: 2.35rem;
  height: 2.35rem;
  border: 1px solid var(--app-border-strong);
  border-radius: 0.55rem;
  box-shadow: inset 0 0 0 0.15rem var(--app-surface-raised);
}

.settings-page__color-control :deep(.p-inputtext) {
  width: 6.4rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--app-border);
  border-radius: 0.55rem;
  background: var(--app-control);
  color: var(--app-text);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.76rem;
}

.settings-page__color-control :deep(.p-inputtext:hover) {
  border-color: var(--app-border-strong) !important;
}

.settings-page__color-control :deep(.p-inputtext:focus) {
  border-color: var(--app-primary-bright) !important;
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.16) !important;
}

.settings-page__color-control :deep(.p-button) {
  gap: 0.35rem;
  padding: 0.45rem 0.55rem;
  color: var(--app-muted);
  font-size: 0.72rem;
}

.settings-page__color-control :deep(.p-button:hover) {
  color: var(--app-primary-bright);
  background: rgba(var(--app-primary-rgb), 0.12);
}

.settings-page__section--chat {
  margin-top: 2.25rem;
}

.settings-page__chat-preview {
  margin-top: 1rem;
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--app-border);
  border-radius: 0.65rem;
  background: var(--app-surface);
}

.settings-page__chat-line {
  display: flex;
  align-items: baseline;
  gap: 0.55rem;
  padding: 0.28rem 0;
  color: var(--app-message-text);
  font-size: 0.78rem;
}

.settings-page__chat-time {
  width: 4rem;
  flex-shrink: 0;
  color: var(--app-muted);
  font-size: 0.68rem;
  text-align: right;
}

.settings-page__chat-nick {
  flex-shrink: 0;
  font-weight: 800;
}

.settings-page__chat-nick--badge {
  padding: 0.04rem 0.45rem;
  border-radius: 0.5rem;
}

.settings-page__chat-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-page__settings-list {
  margin-top: 1rem;
}

.settings-page__settings-list .settings-page__setting {
  margin-top: 0;
  padding: 0.9rem 0;
  border-bottom: 1px solid var(--app-border);
}

.settings-page__setting-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.55rem;
  flex-shrink: 0;
}

.settings-page__setting-control--wrap {
  flex-wrap: wrap;
}

.settings-page__setting-control code {
  color: var(--app-muted);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.72rem;
}

.settings-page__setting-control :deep(.p-inputtext) {
  width: 6.4rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--app-border);
  border-radius: 0.55rem;
  background: var(--app-control);
  color: var(--app-text);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.76rem;
}

.settings-page__setting-control :deep(.p-inputtext:hover) {
  border-color: var(--app-border-strong) !important;
}

.settings-page__setting-control :deep(.p-inputtext:focus) {
  border-color: var(--app-primary-bright) !important;
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.16) !important;
}

.settings-page__setting-control :deep(.p-colorpicker-preview) {
  width: 2.2rem;
  height: 2.2rem;
  border: 1px solid var(--app-border-strong);
  border-radius: 0.55rem;
  box-shadow: inset 0 0 0 0.15rem var(--app-surface-raised);
}

.settings-page__setting-control :deep(.p-button) {
  gap: 0.35rem;
  padding: 0.45rem 0.55rem;
  color: var(--app-muted);
  font-size: 0.72rem;
}

.settings-page__setting-control :deep(.p-button:hover) {
  color: var(--app-primary-bright);
  background: rgba(var(--app-primary-rgb), 0.12);
}

.settings-page__setting-control :deep(.p-selectbutton) {
  display: inline-flex;
}

.settings-page__setting-control :deep(.p-selectbutton .p-togglebutton-content) {
  border-radius: 0;
  background: transparent !important;
  box-shadow: none;
}

.settings-page__setting-control :deep(.p-selectbutton .p-togglebutton) {
  min-width: 4.2rem;
  padding: 0.45rem 0.6rem;
  border-color: var(--app-border);
  background: var(--app-control);
  color: var(--app-muted);
  font-size: 0.72rem;
}

.settings-page__setting-control :deep(.p-selectbutton .p-togglebutton.p-togglebutton-checked) {
  border-color: rgba(var(--app-primary-rgb), 0.35);
  background: rgba(var(--app-primary-rgb), 0.16);
  color: var(--app-primary-bright);
}

@media (max-width: 620px) {
  .settings-page__setting {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.9rem;
  }
}

.app-layout > :first-child {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.app-layout__side {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  width: 280px;
  min-height: 0;
  flex-shrink: 0;
  overflow: hidden;
}

@media (max-width: 900px) {
  .app-layout {
    height: auto;
    min-height: 100vh;
    flex-direction: column;
  }

  .app-layout__side {
    width: 100%;
    overflow: visible;
  }

  .app-layout__side > .sidebar-section-card--scrollable {
    max-height: 32rem;
  }
}
</style>
