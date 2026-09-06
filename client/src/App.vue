<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import Button from "primevue/button";
import ColorPicker from "primevue/colorpicker";
import InputText from "primevue/inputtext";
import Popover from "primevue/popover";
import SelectButton from "primevue/selectbutton";
import Toast from "primevue/toast";
import ToggleSwitch from "primevue/toggleswitch";
import { useToast } from "primevue/usetoast";
import { ArrowLeft, Check, ChevronDown, CircleX, DoorOpen, Map, Play, RotateCcw, Settings2, Sparkles } from "@lucide/vue";
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
import { HIGHLIGHT_STYLE_OPTIONS, highlightTextStyle, messageHasHighlight, normalizeHighlightStyles, normalizeHighlightWords } from "./composables/useMessageHighlighting";
import { useNickColor } from "./composables/useNickColor";
import { clearRememberedCredentials, loadRememberedCredentials, loadOsuAuthData, saveRememberedCredentials, saveOsuAuthData } from "./composables/useRememberedCredentials";
import { getOsuRedirectUri, readOsuAuthorizationCallback, startOsuAuthorization } from "./composables/useOsuOAuth";
import { useServerConnection } from "./composables/useServerConnection";
import { formatLobbyTemplate, useLobbyMessages } from "./composables/useLobbyMessages";
import { useMappool } from "./composables/useMappool";
import { useNowPlayingSettings } from "./composables/useNowPlayingSettings";
import { NOTIFICATION_SOUNDS, NOTIFICATION_TRIGGER_OPTIONS, getNotificationSoundUrl, useNotifications } from "./composables/useNotifications";

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
const directChats = ref([]);
const joinedChannels = ref([]);
const lobbyStates = reactive({});
const channelMessages = reactive({});
const pendingPartChannels = new Set();
const pendingLobbySeed = ref(null);
const pendingLobbyCreatedViaApp = ref(false);
const pendingJoinChannel = ref(null);
let pendingJoinTimeout;
const { primaryColor, setPrimaryColor } = useDarkMode();
const {
  highlightReferee,
  highlightBanchoBot,
  banchoBotColor,
  redTeamColor,
  blueTeamColor,
  unassignedColorMode,
  unassignedColor,
  timestampMode,
  highlightWords,
  highlightStyles,
  highlightColorMode,
  highlightColor,
} = useChatSettings();
const { nickColor: baseNickColor } = useNickColor();
const {
  state: serverState,
  lastEvent,
  login: loginToServer,
  logout: logoutFromServer,
  loginOsu,
  logoutOsu,
  sendMessage: sendServerMessage,
  joinChannel: joinServerChannel,
  partChannel: partServerChannel,
  setLobbyScore,
  setLobbySettings,
  requestApi,
} = useServerConnection();
const connected = computed(() => serverState.value === "ready");
const toast = useToast();
const loginToastGroup = "irc-login";
const { activePreset } = useLobbyMessages();
const { pool, getMapState, qualificationMode } = useMappool();
const { soundEnabled, toastEnabled, ignoreBanchoBot, sound, soundTrigger, toastTrigger } = useNotifications();
const { showNowPlaying, showProgressBar, showProgressTimeLabel } = useNowPlayingSettings();
const nowPlayingByLobby = reactive({});
const primaryColorDraft = ref(primaryColor.value);
const banchoBotColorDraft = ref(banchoBotColor.value);
const redTeamColorDraft = ref(redTeamColor.value);
const blueTeamColorDraft = ref(blueTeamColor.value);
const unassignedColorDraft = ref(unassignedColor.value);
const highlightColorDraft = ref(highlightColor.value);
const highlightStylesPopover = ref(null);
const highlightWordsInputRef = ref(null);
const highlightWordsInputDraft = ref("");
const highlightStyleLabelMap = Object.fromEntries(HIGHLIGHT_STYLE_OPTIONS.map((option) => [option.value, option.label]));

const unassignedColorModes = [
  { label: "Random", value: "random" },
  { label: "Custom", value: "custom" },
];
const highlightColorModes = [
  { label: "Default (White)", value: "default" },
  { label: "Accent color", value: "accent" },
  { label: "Custom", value: "custom" },
];
const timestampModes = [
  { label: "Minutes", value: "minutes" },
  { label: "Full", value: "full" },
];
const notificationSounds = NOTIFICATION_SOUNDS;
const notificationTriggers = NOTIFICATION_TRIGGER_OPTIONS;
const notificationSoundMenuOpen = ref(false);
const notificationSoundMenu = ref(null);
const selectedNotificationSound = computed(() => notificationSounds.find((item) => item.value === sound.value) || notificationSounds[0]);
let notificationAudio;
let pendingNotificationSound;

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
  {
    id: 6,
    time: "12:05:08",
    author: "solo_player",
    text: "This is a highlighted message!",
    highlightPreview: true,
  },
];

const highlightWordsDraft = computed({
  get: () => highlightWords.value,
  set: (value) => {
    highlightWords.value = normalizeHighlightWords(value);
  },
});

const highlightStylesDraft = computed({
  get: () => highlightStyles.value,
  set: (value) => {
    highlightStyles.value = normalizeHighlightStyles(value);
  },
});

const highlightStylesSummary = computed(() => {
  if (!highlightStyles.value.length) return "No styles";
  return highlightStyles.value.map((style) => highlightStyleLabelMap[style] || style).join(", ");
});

const primaryColorPicker = computed({
  get: () => primaryColor.value.replace("#", ""),
  set: (value) => {
    const normalized = `#${String(value).replace("#", "")}`;
    if (/^#[0-9a-f]{6}$/i.test(normalized)) setPrimaryColor(normalized);
  },
});

function normalizeOsuUser(user) {
  if (!user) return null;
  return {
    id: user.id ?? null,
    username: user.username || user.name || "",
    avatarUrl: user.avatarUrl || user.avatar || "",
  };
}

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

const highlightColorPicker = computed({
  get: () => highlightColor.value.replace("#", ""),
  set: (value) => updateChatColor(highlightColor, value),
});

const chatSettingChanged = computed(() => ({
  banchoBotColor: banchoBotColor.value.toLowerCase() !== DEFAULT_CHAT_SETTINGS.banchoBotColor,
  redTeamColor: redTeamColor.value.toLowerCase() !== DEFAULT_CHAT_SETTINGS.redTeamColor,
  blueTeamColor: blueTeamColor.value.toLowerCase() !== DEFAULT_CHAT_SETTINGS.blueTeamColor,
  unassignedColor: unassignedColor.value.toLowerCase() !== DEFAULT_CHAT_SETTINGS.unassignedColor,
  highlightWords: JSON.stringify(normalizeHighlightWords(highlightWords.value)) !== JSON.stringify(DEFAULT_CHAT_SETTINGS.highlightWords),
  highlightStyles: JSON.stringify(normalizeHighlightStyles(highlightStyles.value)) !== JSON.stringify(DEFAULT_CHAT_SETTINGS.highlightStyles),
  highlightColor: highlightColorMode.value !== DEFAULT_CHAT_SETTINGS.highlightColorMode || highlightColor.value.toLowerCase() !== DEFAULT_CHAT_SETTINGS.highlightColor,
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
    const directChat = event.isDirectMessage && event.channel !== "BanchoBot" ? addDirectChat(event.channel) : null;
    const chatId = event.channel === "BanchoBot" ? "bancho" : directChat?.id || joinedChannel?.id;
    if (!chatId) {
      return;
    }

    if (joinedChannel && event.nick?.toLowerCase() === "banchobot") {
      applyRefereeConfirmation(joinedChannel, event.text);
    }

    const player = joinedChannel?.lobby?.players?.find((item) => normalizeIrcNick(item.username) === normalizeIrcNick(event.nick));

    handleNowPlayingEvent(chatId, event.text);
    if (joinedChannel && event.nick?.toLowerCase() === "banchobot") {
      const beatmapId = event.text.match(/https?:\/\/osu\.ppy\.sh\/b\/(\d+)/i)?.[1];
      if (beatmapId) {
        const currentMap = nowPlayingByLobby[chatId];
        const parsedBeatmapId = Number(beatmapId);
        if (Number(currentMap?.beatmapId || currentMap?.id) !== parsedBeatmapId) {
          loadManualNowPlayingMap(chatId, { id: parsedBeatmapId, beatmapId: parsedBeatmapId, url: `https://osu.ppy.sh/b/${beatmapId}` });
        }
      }
    }

    appendChatMessage(
      chatId,
      {
        id: nextId++,
        author: event.nick || "Unknown",
        text: event.text,
        time: event.timestamp,
        team: player?.team || null,
        mods: player?.mods || [],
      },
      { notify: normalizeIrcNick(event.nick) !== normalizeIrcNick(currentUser.value) },
    );
  },
  { flush: "sync" },
);

watch(primaryColor, (value) => {
  primaryColorDraft.value = value;
});

watch([banchoBotColor, redTeamColor, blueTeamColor, unassignedColor, highlightColor], ([bot, red, blue, unassigned, highlight]) => {
  banchoBotColorDraft.value = bot;
  redTeamColorDraft.value = red;
  blueTeamColorDraft.value = blue;
  unassignedColorDraft.value = unassigned;
  highlightColorDraft.value = highlight;
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
  } else if (setting === "highlightWords") {
    highlightWords.value = [...DEFAULT_CHAT_SETTINGS.highlightWords];
    highlightWordsInputDraft.value = "";
  } else if (setting === "highlightStyles") {
    highlightStyles.value = [...DEFAULT_CHAT_SETTINGS.highlightStyles];
  } else if (setting === "highlightColor") {
    highlightColorMode.value = DEFAULT_CHAT_SETTINGS.highlightColorMode;
    highlightColor.value = DEFAULT_CHAT_SETTINGS.highlightColor;
  }
}

function focusHighlightWordsInput() {
  highlightWordsInputRef.value?.focus();
}

function addHighlightWords(tokens) {
  const nextWords = [...highlightWordsDraft.value];
  const existingWords = new Set(nextWords.map((word) => word.toLowerCase()));
  let changed = false;

  tokens.forEach((token) => {
    const word = String(token || "").trim();
    if (!word) return;
    const normalized = word.toLowerCase();
    if (existingWords.has(normalized)) return;
    existingWords.add(normalized);
    nextWords.push(word);
    changed = true;
  });

  if (changed) {
    highlightWordsDraft.value = nextWords;
  }

  return changed;
}

function commitHighlightWordsInput() {
  const tokens = highlightWordsInputDraft.value
    .split(/[,\s]+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (tokens.length) {
    addHighlightWords(tokens);
  }

  highlightWordsInputDraft.value = "";
}

function removeHighlightWord(wordToRemove) {
  const normalized = String(wordToRemove || "")
    .trim()
    .toLowerCase();
  if (!normalized) return;
  highlightWordsDraft.value = highlightWordsDraft.value.filter((word) => word.toLowerCase() !== normalized);
}

function handleHighlightWordsKeydown(event) {
  if (event.key === "Enter" || event.key === "," || event.key === " " || event.key === "Tab") {
    commitHighlightWordsInput();
  }

  if (event.key === "Enter" || event.key === "," || event.key === " ") {
    event.preventDefault();
  }

  if (event.key === "Backspace" && !highlightWordsInputDraft.value && highlightWordsDraft.value.length) {
    highlightWordsDraft.value = highlightWordsDraft.value.slice(0, -1);
  }
}

function handleHighlightWordsPaste(event) {
  const text = event.clipboardData?.getData("text") || "";
  if (!text) return;
  event.preventDefault();
  addHighlightWords(
    text
      .split(/[,\s]+/)
      .map((word) => word.trim())
      .filter(Boolean),
  );
  highlightWordsInputDraft.value = "";
}

function handleHighlightWordsWheel(event) {
  const container = event.currentTarget;
  if (!(container instanceof HTMLElement)) return;

  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) return;

  container.scrollLeft += delta;
  event.preventDefault();
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

function previewMessageStyle(message) {
  if (message.highlightPreview || messageHasHighlight(message.text, highlightWords.value)) {
    return highlightTextStyle(highlightStyles.value, highlightMessageColor.value);
  }
  return {};
}

const highlightMessageColor = computed(() => {
  if (highlightColorMode.value === "accent") return primaryColor.value;
  if (highlightColorMode.value === "custom") return highlightColor.value;
  return "#ffffff";
});

function previewMessageHighlighted(message) {
  return message.highlightPreview || messageHasHighlight(message.text, highlightWords.value);
}

function toggleHighlightStyles(event) {
  highlightStylesPopover.value?.toggle(event);
}

function highlightStyleSelected(style) {
  return highlightStylesDraft.value.includes(style);
}

function toggleHighlightStyle(style) {
  const nextStyles = highlightStylesDraft.value.includes(style) ? highlightStylesDraft.value.filter((item) => item !== style) : [...highlightStylesDraft.value, style];
  highlightStylesDraft.value = nextStyles;
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
  directChats.value = [];
  joinedChannels.value = [];
  Object.keys(channelMessages).forEach((channelIdValue) => {
    delete channelMessages[channelIdValue];
  });
  Object.keys(lobbyStates).forEach((channelIdValue) => {
    delete lobbyStates[channelIdValue];
  });
  Object.keys(roomClosedByChat).forEach((chatId) => {
    delete roomClosedByChat[chatId];
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
  await logoutOsu().catch(() => {});
  osuProfile.value = null;
  osuError.value = "";
  await saveOsuAuthData({
    clientId: osuClientId.value,
    clientSecret: osuClientSecret.value,
    user: null,
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
  osuProfile.value = normalizeOsuUser(osuAuth?.user);

  try {
    const callback = readOsuAuthorizationCallback();
    if (callback) {
      if (!osuClientId.value || !osuClientSecret.value) {
        throw new Error("Enter your osu! OAuth credentials first.");
      }

      osuLoading.value = true;
      const authData = await loginOsu({
        clientId: osuClientId.value,
        clientSecret: osuClientSecret.value,
        code: callback.code,
        redirectUri: getOsuRedirectUri(),
      });
      await saveOsuAuthData({
        clientId: osuClientId.value,
        clientSecret: osuClientSecret.value,
        user: authData,
      });
      osuProfile.value = normalizeOsuUser(authData);
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
  document.addEventListener("click", closeNotificationSoundMenu);
  document.addEventListener("keydown", onNotificationSoundKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("pagehide", handlePageExit);
  window.removeEventListener("beforeunload", handlePageExit);
  document.removeEventListener("click", closeNotificationSoundMenu);
  document.removeEventListener("keydown", onNotificationSoundKeydown);
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
const activeDirectChat = computed(() => directChats.value.find((item) => item.id === activeChat.value) || null);
const activeChatKind = computed(() => {
  if (activeChat.value === "bancho") return "bancho";
  if (activeDirectChat.value) return "dm";
  return "lobby";
});
const activeChatTitle = computed(() => {
  if (activeChat.value === "bancho") return "BanchoBot";
  if (activeDirectChat.value) return activeDirectChat.value.label;
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
const isBanchoChat = computed(() => activeChatKind.value === "bancho");
const isDirectChat = computed(() => activeChatKind.value === "dm");
const activeChatShortcutMode = computed(() => {
  if (isBanchoChat.value) return "bancho";
  if (isDirectChat.value) return "none";
  return "referee";
});
const activeChannel = computed(() => {
  if (activeChatKind.value !== "lobby") return null;
  return joinedChannels.value.find((item) => item.id === activeChat.value);
});
const activeLobbyState = computed(() => {
  if (activeChatKind.value !== "lobby") return null;
  return lobbyStates[activeChat.value];
});
const activeLobbySize = computed(() => activeLobbyState.value?.size ?? 16);
const activeLobbyTeamMode = computed(() => activeLobbyState.value?.teamMode || "HeadToHead");
const activeLobbyScoreMode = computed(() => activeLobbyState.value?.scoreMode || "Score");
const activeLobbyGameMode = computed(() => activeLobbyState.value?.mode || "osu!");
const activeNowPlaying = computed(() => {
  if (!showNowPlaying.value || activeChatKind.value !== "lobby" || roomClosedByChat[activeChat.value]) return null;
  const map = nowPlayingByLobby[activeChat.value];
  if (!map) return null;
  const totalSeconds = Number(map.totalSeconds ?? map.total_seconds);
  return {
    ...map,
    totalSeconds: Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : null,
    pickedBy: map.pickedBy || activeLobbyState.value?.nextPickTeam || null,
    pickedByTeam:
      map.pickedByTeam ||
      (map.pickedBy && normalizeIrcNick(map.pickedBy) === normalizeIrcNick(activeLobbyState.value?.teamRed)
        ? "red"
        : map.pickedBy && normalizeIrcNick(map.pickedBy) === normalizeIrcNick(activeLobbyState.value?.teamBlue)
          ? "blue"
          : null),
    mods: activeLobbyState.value?.activeMods || map.mods || [],
  };
});
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
        .filter((mod) => mod && !/^(?:enabled|disabled|freemod|fm)$/i.test(mod))
    : [];
  return [...lobby.players]
    .sort((left, right) => {
      const leftSlot = Number.isFinite(left.slot) ? left.slot : Number.POSITIVE_INFINITY;
      const rightSlot = Number.isFinite(right.slot) ? right.slot : Number.POSITIVE_INFINITY;
      if (leftSlot !== rightSlot) return leftSlot - rightSlot;
      return left.username.localeCompare(right.username);
    })
    .map((player) => ({
      name: player.username,
      profileUrl: player.profileUrl || (player.userId ? `https://osu.ppy.sh/u/${player.userId}` : ""),
      isHost: false,
      isReady: Boolean(player.ready),
      avatarUrl: player.avatarUrl || (player.userId ? `https://a.ppy.sh/${player.userId}` : ""),
      team: player.team || null,
      slot: player.slot ?? null,
      mods: [...commonMods, ...(player.mods || [])]
        .filter((mod) => !/^(?:enabled|disabled|freemod|fm)$/i.test(String(mod).trim()))
        .filter((mod, index, mods) => mods.findIndex((candidate) => candidate.toLowerCase() === mod.toLowerCase()) === index),
    }));
});
const activeLobbyReferees = computed(() => {
  const channel = joinedChannels.value.find((item) => item.id === activeChat.value);
  if (Array.isArray(channel?.referees)) {
    return channel.referees;
  }
  return currentUser.value ? [currentUser.value] : [];
});
const activeRefereeUsers = computed(() => (isDirectChat.value ? [] : activeLobbyReferees.value));
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

function directChatId(nick) {
  return `dm:${normalizeIrcNick(nick)}`;
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
    mode: "osu!",
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

function addDirectChat(nick) {
  const label = String(nick || "").trim();
  if (!label) return null;

  const id = directChatId(label);
  const existingChat = directChats.value.find((chat) => chat.id === id);
  if (existingChat) {
    existingChat.label = label;
    channelMessages[id] ||= [];
    unreadChats[id] ??= false;
    return existingChat;
  }

  const chat = {
    id,
    label,
    source: "dm",
  };
  directChats.value.push(chat);
  channelMessages[id] ||= [];
  unreadChats[id] = false;
  return chat;
}

function removeDirectChat(chatId) {
  const index = directChats.value.findIndex((chat) => chat.id === chatId);
  if (index === -1) return;

  directChats.value.splice(index, 1);
  delete channelMessages[chatId];
  delete unreadChats[chatId];
  if (activeChat.value === chatId) {
    activeChat.value = "bancho";
    unreadChats.bancho = false;
    settingsOpen.value = false;
  }
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

function playNotificationSound(filename = sound.value) {
  const url = getNotificationSoundUrl(filename);
  if (!url) return;

  if (notificationAudio && !notificationAudio.paused && !notificationAudio.ended) {
    pendingNotificationSound = filename;
    return;
  }

  notificationAudio = new Audio(url);
  notificationAudio.volume = 1;
  notificationAudio.onended = () => {
    notificationAudio = undefined;
    if (pendingNotificationSound) {
      const nextSound = pendingNotificationSound;
      pendingNotificationSound = undefined;
      playNotificationSound(nextSound);
    }
  };
  notificationAudio.play().catch(() => {
    notificationAudio = undefined;
    pendingNotificationSound = undefined;
  });
}

function previewNotificationSound(filename) {
  if (!soundEnabled.value) return;
  const url = getNotificationSoundUrl(filename);
  if (!url) return;

  if (notificationAudio) {
    notificationAudio.onended = null;
    notificationAudio.pause();
    notificationAudio = undefined;
  }
  pendingNotificationSound = undefined;

  const audio = new Audio(url);
  audio.volume = 1;
  audio.onended = () => {
    if (notificationAudio === audio) notificationAudio = undefined;
  };
  notificationAudio = audio;
  audio.play().catch(() => {
    if (notificationAudio === audio) notificationAudio = undefined;
  });
}

function toggleNotificationSoundMenu() {
  if (!soundEnabled.value) return;
  notificationSoundMenuOpen.value = !notificationSoundMenuOpen.value;
}

function selectNotificationSound(value) {
  if (!soundEnabled.value) return;
  sound.value = value;
  notificationSoundMenuOpen.value = false;
}

function closeNotificationSoundMenu(event) {
  if (!notificationSoundMenu.value?.contains(event.target)) {
    notificationSoundMenuOpen.value = false;
  }
}

function onNotificationSoundKeydown(event) {
  if (event.key === "Escape") notificationSoundMenuOpen.value = false;
}

function notificationChatTitle(chatId) {
  if (chatId === "bancho") return "BanchoBot";
  const directChat = directChats.value.find((chat) => chat.id === chatId);
  if (directChat) return directChat.label;
  const channel = joinedChannels.value.find((item) => item.id === chatId);
  return channel?.lobby?.name || channel?.label || chatId;
}

function notificationMatchesTrigger(trigger, message) {
  return trigger === "always" || messageHasHighlight(message.text, highlightWords.value);
}

function notifyIncomingMessage(chatId, message) {
  if (activeChat.value === chatId) return;
  if (ignoreBanchoBot.value && message.author?.toLowerCase() === "banchobot") return;

  if (soundEnabled.value && notificationMatchesTrigger(soundTrigger.value, message)) {
    playNotificationSound();
  }

  if (toastEnabled.value && notificationMatchesTrigger(toastTrigger.value, message)) {
    toast.add({
      severity: "info",
      summary: notificationChatTitle(chatId),
      detail: `${message.author || "Unknown"}: ${message.text}`,
      life: 5000,
    });
  }
}

function appendChatMessage(chatId, message, { notify = false } = {}) {
  const list = chatId === "bancho" ? banchoMessages.value : (channelMessages[chatId] ||= []);
  list.push(message);
  if (activeChat.value !== chatId) {
    unreadChats[chatId] = true;
    if (notify) notifyIncomingMessage(chatId, message);
  }
}

function localNowPlayingMap(map, pickedBy = null) {
  return {
    ...map,
    title: map.name,
    diff: map.diff,
    mapperName: map.mapperName || map.author || "",
    pickedBy,
    status: "waiting",
    error: null,
  };
}

function setNowPlaying(chatId, map) {
  if (!chatId) return;
  nowPlayingByLobby[chatId] = map;
}

function nextPickedMap(chatId) {
  if (!pool.value) return null;
  return pool.value.maps.find((map) => {
    const state = getMapState(chatId, map.slot);
    return state.picked && !state.banned;
  });
}

async function loadManualNowPlayingMap(chatId, beatmap) {
  const beatmapId = beatmap?.beatmapId || beatmap?.id;
  if (!beatmapId) return;
  const previousMap = nowPlayingByLobby[chatId];
  if (!previousMap) {
    setNowPlaying(chatId, { ...beatmap, status: "waiting", error: "Loading map…" });
  }
  try {
    const info = await requestApi(`/beatmaps/${beatmapId}`);
    let mapperName = typeof info.creator === "string" ? info.creator : info.creator?.username || "";
    if (!mapperName && info.user_id != null) {
      try {
        const mapper = await requestApi(`/users/${info.user_id}`);
        mapperName = mapper.username || mapper.name || "";
      } catch {
        // The map itself is still usable when the optional mapper lookup fails.
      }
    }
    setNowPlaying(chatId, {
      ...beatmap,
      title: info.title || info.beatmapset?.title || "Unknown title",
      artist: info.artist || info.beatmapset?.artist || "Unknown artist",
      diff: info.version || "",
      mapperName,
      starRating: info.difficulty_rating ?? null,
      totalSeconds: info.total_length ?? null,
      beatmapsetId: info.beatmapset_id || info.beatmapset?.id || null,
      pickedBy: activeLobbyState.value?.nextPickTeam || null,
      pickedByTeam:
        activeLobbyState.value?.nextPickTeam && normalizeIrcNick(activeLobbyState.value.nextPickTeam) === normalizeIrcNick(activeLobbyState.value.teamRed)
          ? "red"
          : activeLobbyState.value?.nextPickTeam && normalizeIrcNick(activeLobbyState.value.nextPickTeam) === normalizeIrcNick(activeLobbyState.value.teamBlue)
            ? "blue"
            : null,
      status: "waiting",
      error: null,
    });
  } catch (error) {
    if (!previousMap) {
      setNowPlaying(chatId, { ...beatmap, status: "waiting", error: error.message || "Unable to load map" });
    }
  }
}

function handleNowPlayingEvent(chatId, text) {
  const normalized = String(text || "").trim();
  if (/^Host is changing map\.\.\.$/i.test(normalized)) {
    delete nowPlayingByLobby[chatId];
    return;
  }
  if (/^The match has started!?$/i.test(normalized) && nowPlayingByLobby[chatId]) {
    nowPlayingByLobby[chatId].status = "playing";
    nowPlayingByLobby[chatId].startTimestamp = Date.now();
    nowPlayingByLobby[chatId].progressAborted = false;
  }
  if (/^(?:Aborted the match|The match has been aborted)!?$/i.test(normalized) && nowPlayingByLobby[chatId]) {
    nowPlayingByLobby[chatId].status = "waiting";
    nowPlayingByLobby[chatId].progressAborted = true;
  }
  if (/^The match has finished!?$/i.test(normalized) && nowPlayingByLobby[chatId]) {
    nowPlayingByLobby[chatId].status = "finished";
    window.setTimeout(() => {
      if (nowPlayingByLobby[chatId]?.status === "finished") {
        const nextMap = nextPickedMap(chatId);
        nowPlayingByLobby[chatId] = nextMap ? localNowPlayingMap(nextMap) : null;
      }
    }, 3000);
  }
}

function markRoomClosed(chatId) {
  if (roomClosedByChat[chatId]) return;
  roomClosedByChat[chatId] = true;
  delete nowPlayingByLobby[chatId];
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

  if (directChats.value.some((chat) => chat.id === chatId)) {
    removeDirectChat(chatId);
    return;
  }

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
  const channel = activeChat.value === "bancho" ? "BanchoBot" : activeDirectChat.value?.label || joinedChannels.value.find((item) => item.id === activeChat.value)?.label;
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
  if (/^!mp\s+abort\b/i.test(command.trim()) && nowPlayingByLobby[activeChat.value]) {
    nowPlayingByLobby[activeChat.value].status = "waiting";
    nowPlayingByLobby[activeChat.value].progressAborted = true;
  }
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
  if (winningScore && teamOneScore === winningScore - 1 && teamTwoScore === winningScore - 1) {
    return "We're going to Tiebreaker!";
  }
  return lobby.nextPickTeam ? `Next Pick: ${lobby.nextPickTeam}` : "—";
}

function resolveBeatmapWinner(teamRedName, teamBlueName, teamRedScore, teamBlueScore, explicitWinner = null) {
  if (explicitWinner === teamRedName || explicitWinner === teamBlueName || explicitWinner === "Draw") {
    return explicitWinner;
  }
  if (!Number.isFinite(teamRedScore) || !Number.isFinite(teamBlueScore)) {
    return "—";
  }
  if (teamRedScore === teamBlueScore) return "Draw";
  return teamRedScore > teamBlueScore ? teamRedName : teamBlueName;
}

function getLobbyTemplateValues(lobby, result = {}) {
  const teamRedName = lobby.teamRed || result.teamAName || "Team A";
  const teamBlueName = lobby.teamBlue || result.teamBName || "Team B";
  const teamRedScore = lobby.teamRedScore ?? 0;
  const teamBlueScore = lobby.teamBlueScore ?? 0;
  const lastPlay = lobby.lastPlay || {};
  const hasLastPlay = Number.isFinite(lastPlay.teamRedScore) && Number.isFinite(lastPlay.teamBlueScore);
  const rawBeatmapTeamRedScore = Number.isFinite(result.beatmapTeamRedScore) ? result.beatmapTeamRedScore : hasLastPlay ? lastPlay.teamRedScore : "—";
  const rawBeatmapTeamBlueScore = Number.isFinite(result.beatmapTeamBlueScore) ? result.beatmapTeamBlueScore : hasLastPlay ? lastPlay.teamBlueScore : "—";
  const beatmapWinner = resolveBeatmapWinner(teamRedName, teamBlueName, rawBeatmapTeamRedScore, rawBeatmapTeamBlueScore, result.beatmapWinner);
  const accuracySuffix = result.accuracy ? "%" : "";
  const roundAccuracy = (score) => Math.round((score + Number.EPSILON) * 100) / 100;
  const formatBeatmapScore = (score) => (accuracySuffix && Number.isFinite(score) ? `${roundAccuracy(score)}%` : score);
  const beatmapTeamRedScore = formatBeatmapScore(rawBeatmapTeamRedScore);
  const beatmapTeamBlueScore = formatBeatmapScore(rawBeatmapTeamBlueScore);
  const availableMaps =
    pool.value?.maps
      ?.filter((map) => {
        const state = getMapState(activeChat.value, map.slot);
        return !state.picked && !state.banned;
      })
      .map((map) => map.slot)
      .join(", ") || "—";

  return {
    beatmapWinner,
    beatmap: lobby.currentBeatmap?.url || "—",
    availableMaps,
    beatmapTeamRedScore,
    beatmapTeamBlueScore,
    teamRedName,
    teamBlueName,
    matchTeamRedScore: teamRedScore,
    matchTeamBlueScore: teamBlueScore,
    scoreDifference:
      Number.isFinite(rawBeatmapTeamRedScore) && Number.isFinite(rawBeatmapTeamBlueScore)
        ? accuracySuffix
          ? `${roundAccuracy(Math.abs(rawBeatmapTeamRedScore - rawBeatmapTeamBlueScore))}%`
          : Math.abs(rawBeatmapTeamRedScore - rawBeatmapTeamBlueScore)
        : 0,
    matchStatus: getMatchStatus(lobby, teamRedName, teamBlueName),
    bestOf: lobby.bestOf ?? "—",
  };
}

function handleMappoolPick(map) {
  if (activeChatKind.value !== "lobby") return;
  const picker = activeLobbyState.value?.players?.find((player) => normalizeIrcNick(player.username) === normalizeIrcNick(currentUser.value));
  const totalSeconds = map.totalSeconds ?? map.total_seconds ?? null;
  setNowPlaying(activeChat.value, {
    ...map,
    artist: map.artist || "",
    title: map.name,
    totalSeconds,
    total_seconds: totalSeconds,
    pickedBy: activeLobbyState.value?.nextPickTeam || picker?.team || null,
    pickedByTeam:
      activeLobbyState.value?.nextPickTeam && normalizeIrcNick(activeLobbyState.value.nextPickTeam) === normalizeIrcNick(activeLobbyState.value.teamRed)
        ? "red"
        : activeLobbyState.value?.nextPickTeam && normalizeIrcNick(activeLobbyState.value.nextPickTeam) === normalizeIrcNick(activeLobbyState.value.teamBlue)
          ? "blue"
          : picker?.team || null,
    status: "waiting",
    error: null,
  });
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
    :user-avatar="osuProfile?.avatarUrl || ''"
    :active-chat="activeChat"
    :unread-chats="unreadChats"
    :direct-chats="directChats"
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

      <section class="settings-page__section settings-page__section--notifications">
        <div class="settings-page__section-heading">
          <h2>Notifications</h2>
        </div>

        <div class="settings-page__setting">
          <div class="settings-page__setting-info">
            <h3>Sound notifications</h3>
            <p>Play a sound when a message arrives in a chat that is not currently open.</p>
          </div>
          <div class="settings-page__setting-control">
            <ToggleSwitch v-model="soundEnabled" inputId="notification-sound-enabled" class="app-solid-switch" />
          </div>
        </div>

        <div class="settings-page__setting">
          <div class="settings-page__setting-info">
            <h3>Toast notifications</h3>
            <p>Show a toast when a message arrives in a chat that is not currently open.</p>
          </div>
          <div class="settings-page__setting-control">
            <ToggleSwitch v-model="toastEnabled" inputId="notification-toast-enabled" class="app-solid-switch" />
          </div>
        </div>

        <div class="settings-page__setting">
          <div class="settings-page__setting-info">
            <h3>Ignore BanchoBot</h3>
            <p>Do not play sounds or show toasts for messages from BanchoBot.</p>
          </div>
          <div class="settings-page__setting-control">
            <ToggleSwitch v-model="ignoreBanchoBot" :disabled="!soundEnabled && !toastEnabled" inputId="notification-ignore-bancho-bot" class="app-solid-switch" />
          </div>
        </div>

        <div class="settings-page__setting">
          <div class="settings-page__setting-info">
            <h3>Notification sound</h3>
            <p>Choose a sound and preview it before using it for notifications.</p>
          </div>
          <div class="settings-page__setting-control settings-page__setting-control--wrap">
            <div ref="notificationSoundMenu" class="settings-page__sound-dropdown" :class="{ 'settings-page__sound-dropdown--disabled': !soundEnabled }">
              <button
                type="button"
                class="settings-page__sound-dropdown-trigger"
                :disabled="!soundEnabled"
                :aria-expanded="notificationSoundMenuOpen"
                aria-haspopup="listbox"
                aria-label="Notification sound"
                @click.stop="toggleNotificationSoundMenu"
              >
                <span>{{ selectedNotificationSound?.label }}</span>
                <ChevronDown :size="14" />
              </button>
              <div v-if="notificationSoundMenuOpen && soundEnabled" class="settings-page__sound-dropdown-menu" role="listbox" aria-label="Notification sounds">
                <div
                  v-for="item in notificationSounds"
                  :key="item.value"
                  type="button"
                  class="settings-page__sound-dropdown-option"
                  :class="{ 'settings-page__sound-dropdown-option--selected': item.value === sound }"
                  role="option"
                  :aria-selected="item.value === sound"
                >
                  <button type="button" class="settings-page__sound-dropdown-select" @click="selectNotificationSound(item.value)">{{ item.label }}</button>
                  <button
                    type="button"
                    class="settings-page__sound-dropdown-preview"
                    :disabled="!soundEnabled"
                    :aria-label="`Preview ${item.label}`"
                    :title="`Preview ${item.label}`"
                    @click.stop="previewNotificationSound(item.value)"
                  >
                    <Play :size="13" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-page__setting">
          <div class="settings-page__setting-info">
            <h3>Sound notification scenario</h3>
            <p>Choose whether sound plays for every message or only messages containing a highlight word.</p>
          </div>
          <div class="settings-page__setting-control">
            <SelectButton
              v-model="soundTrigger"
              :options="notificationTriggers"
              optionLabel="label"
              optionValue="value"
              :allowEmpty="false"
              :disabled="!soundEnabled"
              aria-label="Sound notification scenario"
            />
          </div>
        </div>

        <div class="settings-page__setting">
          <div class="settings-page__setting-info">
            <h3>Toast notification scenario</h3>
            <p>Choose whether toast appears for every message or only messages containing a highlight word.</p>
          </div>
          <div class="settings-page__setting-control">
            <SelectButton
              v-model="toastTrigger"
              :options="notificationTriggers"
              optionLabel="label"
              optionValue="value"
              :allowEmpty="false"
              :disabled="!toastEnabled"
              aria-label="Toast notification scenario"
            />
          </div>
        </div>
      </section>

      <section class="settings-page__section">
        <div class="settings-page__section-heading">
          <h2>Now Playing</h2>
        </div>
        <div class="settings-page__setting">
          <div class="settings-page__setting-info">
            <h3>Show now playing</h3>
            <p>Show the currently selected beatmap above the chat log.</p>
          </div>
          <div class="settings-page__setting-control">
            <ToggleSwitch v-model="showNowPlaying" inputId="show-now-playing" class="app-solid-switch" />
          </div>
        </div>
        <div class="settings-page__setting">
          <div class="settings-page__setting-info">
            <h3>Show progress bar</h3>
            <p>Show elapsed time and progress for the currently playing map.</p>
          </div>
          <div class="settings-page__setting-control">
            <ToggleSwitch v-model="showProgressBar" inputId="show-progress-bar" class="app-solid-switch" />
          </div>
        </div>
        <div class="settings-page__setting">
          <div class="settings-page__setting-info">
            <h3>Show progress time</h3>
            <p>Show the elapsed time label above the progress bar.</p>
          </div>
          <div class="settings-page__setting-control">
            <ToggleSwitch v-model="showProgressTimeLabel" inputId="show-progress-time-label" class="app-solid-switch" />
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
            <span class="settings-page__chat-text" :class="{ 'settings-page__chat-text--highlighted': previewMessageHighlighted(message) }" :style="previewMessageStyle(message)">
              {{ message.text }}
            </span>
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

          <div class="settings-page__setting settings-page__setting--highlight">
            <div class="settings-page__setting-info">
              <h3>Highlight words</h3>
              <p>Messages containing any of these words will use the selected text styles.</p>
            </div>
            <div class="settings-page__setting-control settings-page__setting-control--highlight">
              <div class="settings-page__highlight-tags" @click="focusHighlightWordsInput" @wheel="handleHighlightWordsWheel">
                <div class="settings-page__highlight-chiplist" aria-label="Highlight words">
                  <button
                    v-for="word in highlightWordsDraft"
                    :key="word"
                    type="button"
                    class="settings-page__highlight-chip"
                    :aria-label="`Remove highlight word ${word}`"
                    @mousedown.prevent
                    @click.stop="removeHighlightWord(word)"
                  >
                    <span class="settings-page__highlight-chip-label">{{ word }}</span>
                    <CircleX :size="12" />
                  </button>
                  <input
                    ref="highlightWordsInputRef"
                    v-model="highlightWordsInputDraft"
                    class="settings-page__highlight-input"
                    aria-label="Highlight words"
                    placeholder="Type a word"
                    spellcheck="false"
                    @blur="commitHighlightWordsInput"
                    @keydown="handleHighlightWordsKeydown"
                    @paste="handleHighlightWordsPaste"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="settings-page__setting">
            <div class="settings-page__setting-info">
              <h3>Highlight styles</h3>
              <p>Pick one or more text styles for highlighted messages.</p>
            </div>
            <div class="settings-page__setting-control settings-page__setting-control--styles">
              <Button text size="small" class="settings-page__styles-button" aria-label="Choose highlight styles" @click="toggleHighlightStyles">
                <Sparkles :size="14" />
                <span>{{ highlightStylesSummary }}</span>
                <ChevronDown :size="12" />
              </Button>
            </div>
          </div>

          <div class="settings-page__setting">
            <div class="settings-page__setting-info">
              <h3>Highlight message color</h3>
              <p>Choose the text color used for messages containing a highlighted word.</p>
            </div>
            <div class="settings-page__setting-control settings-page__setting-control--wrap">
              <SelectButton v-model="highlightColorMode" :options="highlightColorModes" optionLabel="label" optionValue="value" :allowEmpty="false" aria-label="Highlight message color mode" />
              <template v-if="highlightColorMode === 'custom'">
                <ColorPicker v-model="highlightColorPicker" />
                <InputText
                  v-model="highlightColorDraft"
                  aria-label="Highlight message color hex value"
                  spellcheck="false"
                  @blur="commitChatColor(highlightColor, highlightColorDraft)"
                  @keydown.enter="commitChatColor(highlightColor, highlightColorDraft)"
                />
              </template>
              <Button v-if="chatSettingChanged.highlightColor" text size="small" aria-label="Reset highlight message color" @click="resetChatSetting('highlightColor')">
                <RotateCcw :size="14" />
                <span>Reset</span>
              </Button>
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

      <Popover ref="highlightStylesPopover" class="settings-page__styles-popover">
        <div class="settings-page__styles-popover-body">
          <button
            v-for="option in HIGHLIGHT_STYLE_OPTIONS"
            :key="option.value"
            type="button"
            class="settings-page__styles-option"
            :class="{ 'settings-page__styles-option--selected': highlightStyleSelected(option.value) }"
            :aria-pressed="highlightStyleSelected(option.value)"
            @click="toggleHighlightStyle(option.value)"
          >
            <span class="settings-page__styles-option-left">
              <Check v-if="highlightStyleSelected(option.value)" :size="14" class="settings-page__styles-option-check" />
              <span v-else class="settings-page__styles-option-check settings-page__styles-option-check--spacer" aria-hidden="true"></span>
              <component :is="option.icon" :size="14" />
              <span class="settings-page__styles-option-label">{{ option.label }}</span>
            </span>
          </button>
        </div>
      </Popover>
    </div>

    <div v-else class="app-layout">
      <ChatWindow
        :title="activeChatTitle"
        :connected="connected"
        :messages="activeMessages"
        :current-user="currentUser"
        :referee-users="activeRefereeUsers"
        :shortcut-mode="activeChatShortcutMode"
        :auto-scroll-token="commandScrollToken"
        :room-size="activeLobbySize"
        :room-closed="Boolean(roomClosedByChat[activeChat])"
        :timer-active="activeLobbyTimer"
        :timer-seconds="activeLobbyTimerSeconds"
        :format="activeLobbyTeamMode"
        :win-condition="activeLobbyScoreMode"
        :mode="activeLobbyGameMode"
        :now-playing="activeNowPlaying"
        :show-progress-bar="showProgressBar"
        :show-progress-time-label="showProgressTimeLabel"
        :team-red-name="activeLobbyState?.teamRed || ''"
        :team-blue-name="activeLobbyState?.teamBlue || ''"
        @send="handleSend"
        @send-command="handleCommand"
        @create-lobby="createLobbyDialogOpen = true"
        @toggle-sidebar="sidebarOpen = !sidebarOpen"
      />

      <div v-if="activeChatKind === 'lobby'" class="app-layout__side">
        <SidebarSectionCard title="Lobby" :icon="DoorOpen">
          <LobbyScoreCard
            v-model:qualification-mode="qualificationMode"
            v-model:team-a-score="activeLobbyTeamAScore"
            v-model:team-b-score="activeLobbyTeamBScore"
            :lobby-id="activeLobbyState?.id ? String(activeLobbyState.id) : ''"
            :team-a-name="activeLobbyState?.teamRed || 'Team A'"
            :team-b-name="activeLobbyState?.teamBlue || 'Team B'"
            :best-of="activeLobbyState?.bestOf"
            :next-pick-team="activeLobbyState?.nextPickTeam"
            :can-edit="currentUser === refereeUser"
            :show-match-controls="!qualificationMode"
            :show-qualification-toggle="!activeChannel?.createdViaCreateLobby"
            :disabled="Boolean(roomClosedByChat[activeChat])"
            :mp-link="activeLobbyState?.id ? `https://osu.ppy.sh/mp/${activeLobbyState.id}` : ''"
            @send-result="handleSendResult"
            @update-settings="updateActiveLobbySettings"
          />
        </SidebarSectionCard>
        <PlayerListCard :players="activeLobbyPlayers" :current-user="currentUser" />
        <SidebarSectionCard title="Mappool" :icon="Map" scrollable>
          <MappoolCard :disabled="Boolean(roomClosedByChat[activeChat])" :lobby-id="activeChat" @send-command="handleCommand" @pick-map="handleMappoolPick" />
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

.settings-page__setting-control--stack {
  align-items: stretch;
  flex-direction: column;
  gap: 0.6rem;
}

.settings-page__setting-control--styles {
  align-items: center;
  justify-content: flex-end;
  flex-wrap: nowrap;
}

.settings-page__setting--highlight {
  align-items: center;
  gap: 1.25rem;
}

.settings-page__setting--highlight .settings-page__setting-info {
  flex: 1 1 auto;
}

.settings-page__setting-control--highlight {
  align-items: center;
  justify-content: flex-end;
  flex: 0 1 22rem;
  width: min(100%, 22rem);
  max-width: 22rem;
  min-width: 0;
  flex-wrap: nowrap;
  gap: 0.9rem;
}

.settings-page__highlight-tags {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  height: 2.6rem;
  min-height: 2.6rem;
  max-height: 2.6rem;
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--app-border);
  border-radius: 0.65rem;
  background: var(--app-control);
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.settings-page__highlight-tags:focus-within {
  border-color: rgba(var(--app-primary-rgb), 0.4);
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.14);
}

.settings-page__highlight-tags::-webkit-scrollbar {
  display: none;
}

.settings-page__highlight-chiplist {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.45rem;
  width: max-content;
  min-width: 0;
  overflow: visible;
  white-space: nowrap;
}

.settings-page__highlight-chip {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 0.35rem;
  padding: 0.28rem 0.6rem;
  border: 1px solid rgba(var(--app-primary-rgb), 0.18);
  border-radius: 999px;
  background: rgba(var(--app-primary-rgb), 0.12);
  color: var(--app-primary-bright);
  font-size: 0.72rem;
  white-space: nowrap;
  cursor: pointer;
}

.settings-page__highlight-chip:hover {
  border-color: rgba(var(--app-primary-rgb), 0.28);
  background: rgba(var(--app-primary-rgb), 0.18);
}

.settings-page__highlight-chip-label {
  min-width: 0;
}

.settings-page__highlight-chip svg {
  flex: 0 0 auto;
}

.settings-page__highlight-input {
  flex: 0 0 9rem;
  width: 9rem;
  min-width: 7rem;
  max-width: 9rem;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--app-text);
  font-size: 0.76rem;
  box-shadow: none;
}

.settings-page__highlight-input::placeholder {
  color: var(--app-muted);
}

.settings-page__highlight-input:focus {
  outline: none;
}

.settings-page__styles-button {
  justify-content: space-between;
  min-width: 0;
  width: 100%;
}

.settings-page__styles-button :deep(.p-button-label) {
  flex: 1 1 auto;
  text-align: left;
}

.settings-page__styles-popover {
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 0.8rem;
  background: var(--app-surface-raised);
  box-shadow: 0 1.25rem 3rem rgba(0, 0, 0, 0.35);
}

.settings-page__styles-popover :deep(.p-popover-content) {
  padding: 0.65rem;
}

.settings-page__styles-popover-body {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 14rem;
  max-width: 18rem;
  max-height: 13rem;
  overflow: auto;
}

.settings-page__styles-option {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 0;
  padding: 0.6rem 0.72rem;
  border: 1px solid transparent;
  border-radius: 0.6rem;
  background: transparent;
  color: var(--app-text);
  cursor: pointer;
  text-align: left;
}

.settings-page__styles-option:hover,
.settings-page__styles-option:focus-visible {
  background: rgba(var(--app-primary-rgb), 0.12);
  outline: none;
}

.settings-page__styles-option--selected {
  background: rgba(var(--app-primary-rgb), 0.18);
}

.settings-page__styles-option-left {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
  width: 100%;
}

.settings-page__styles-option-check {
  flex: 0 0 auto;
  color: var(--app-primary-bright);
}

.settings-page__styles-option-check--spacer {
  width: 14px;
  height: 14px;
}

.settings-page__styles-option {
  font-size: 0.78rem;
}

.settings-page__styles-option-label {
  flex: 1 1 auto;
  min-width: 0;
}

.settings-page__styles-option svg {
  color: var(--app-primary-bright);
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

.settings-page__sound-dropdown {
  position: relative;
  width: 12.4rem;
}

.settings-page__sound-dropdown-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 2.2rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--app-border);
  border-radius: 0.55rem;
  background: var(--app-control);
  color: var(--app-text);
  font: inherit;
  font-size: 0.76rem;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.settings-page__sound-dropdown-trigger:not(:disabled):hover,
.settings-page__sound-dropdown-trigger:not(:disabled)[aria-expanded="true"] {
  border-color: var(--app-primary-bright);
}

.settings-page__sound-dropdown-trigger:not(:disabled)[aria-expanded="true"] {
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.16);
}

.settings-page__sound-dropdown--disabled {
  opacity: 0.42;
  filter: saturate(0.35);
}

.settings-page__sound-dropdown--disabled .settings-page__sound-dropdown-trigger {
  cursor: not-allowed;
}

.settings-page__sound-dropdown-trigger svg {
  flex-shrink: 0;
  color: var(--app-muted);
}

.settings-page__sound-dropdown-menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 0.35rem);
  right: 0;
  left: 0;
  max-height: 15rem;
  overflow-y: auto;
  padding: 0.3rem;
  border: 1px solid var(--app-border);
  border-radius: 0.55rem;
  background: var(--app-surface-raised);
  box-shadow: 0 1rem 2.5rem rgba(0, 0, 0, 0.35);
}

.settings-page__sound-dropdown-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 0.55rem;
  padding: 0.1rem 0.2rem 0.1rem 0.7rem;
  border-radius: 0.4rem;
  background: transparent;
  color: var(--app-text);
}

.settings-page__sound-dropdown-option:hover,
.settings-page__sound-dropdown-option:focus-within {
  background: rgba(var(--app-primary-rgb), 0.12);
  outline: none;
}

.settings-page__sound-dropdown-option--selected {
  background: rgba(var(--app-primary-rgb), 0.18);
  color: var(--app-primary-bright);
}

.settings-page__sound-dropdown-select {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.45rem 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.76rem;
  text-align: left;
  cursor: pointer;
}

.settings-page__sound-dropdown-select:focus-visible,
.settings-page__sound-dropdown-preview:focus-visible {
  outline: 2px solid var(--app-primary-bright);
  outline-offset: -1px;
}

.settings-page__sound-dropdown-preview {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  height: 1.8rem;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  border-radius: 0.35rem;
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
}

.settings-page__sound-dropdown-preview:hover {
  background: rgba(var(--app-primary-rgb), 0.18);
  color: var(--app-primary-bright);
}

.settings-page__sound-dropdown-preview:disabled {
  cursor: not-allowed;
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

.settings-page__setting-control :deep(.p-disabled),
.settings-page__setting-control :deep(.p-disabled *) {
  cursor: not-allowed !important;
}

.settings-page__setting-control :deep(.p-selectbutton .p-togglebutton.p-disabled),
.settings-page__setting-control :deep(.p-selectbutton .p-togglebutton[data-p-disabled="true"]) {
  opacity: 0.42;
  filter: saturate(0.35);
}

.settings-page__setting-control :deep(.p-toggleswitch.p-disabled),
.settings-page__setting-control :deep(.p-toggleswitch[data-p-disabled="true"]) {
  opacity: 0.42;
  filter: saturate(0.35);
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
