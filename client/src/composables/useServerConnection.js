import { ref, shallowRef } from "vue";

function getDefaultWebSocketUrl() {
  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}/ws`;
  }

  const hostname = window.location.hostname === "0.0.0.0" ? "127.0.0.1" : window.location.hostname || "127.0.0.1";
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${hostname}:3000/ws`;
}
const socket = shallowRef(null);
const state = ref("disconnected");
const lastError = ref("");
const lastEvent = ref(null);
const loginTimeout = 10000;
let pendingLogin = null;

function send(socketInstance, payload) {
  if (socketInstance.readyState !== WebSocket.OPEN) return false;
  socketInstance.send(JSON.stringify(payload));
  return true;
}

function sendMessage(channel, message) {
  return socket.value ? send(socket.value, { type: "send_message", channel, message }) : false;
}

function sendChannelCommand(type, channel) {
  return socket.value ? send(socket.value, { type, channel }) : false;
}

function setLobbyScore(channel, teamRedScore, teamBlueScore) {
  return socket.value
    ? send(socket.value, {
        type: "set_lobby_score",
        channel,
        teamRedScore,
        teamBlueScore,
      })
    : false;
}

function setLobbySettings(channel, bestOf, nextPickTeam) {
  return socket.value
    ? send(socket.value, {
        type: "set_lobby_settings",
        channel,
        bestOf,
        nextPickTeam,
      })
    : false;
}

function closeSocket(sendLogout = false) {
  if (pendingLogin) {
    clearTimeout(pendingLogin.timeoutId);
    pendingLogin.reject(new Error("Login request was cancelled."));
    pendingLogin = null;
  }
  if (socket.value) {
    if (sendLogout) {
      send(socket.value, { type: "logout" });
    }
    socket.value.close();
    socket.value = null;
  }
  state.value = "disconnected";
}

function resolveLogin() {
  if (!pendingLogin) return;
  clearTimeout(pendingLogin.timeoutId);
  pendingLogin.resolve();
  pendingLogin = null;
}

function rejectLogin(error) {
  if (!pendingLogin) return;
  clearTimeout(pendingLogin.timeoutId);
  pendingLogin.reject(error);
  pendingLogin = null;
}

export function useServerConnection() {
  function login(loginName, password) {
    closeSocket(true);
    lastError.value = "";
    state.value = "connecting";

    const promise = new Promise((resolve, reject) => {
      pendingLogin = {
        resolve,
        reject,
        timeoutId: setTimeout(() => {
          const error = new Error("IRC login timed out.");
          state.value = "error";
          lastError.value = error.message;
          rejectLogin(error);
          closeSocket();
        }, loginTimeout),
      };
    });

    let socketInstance;
    try {
      socketInstance = new WebSocket(import.meta.env.VITE_WS_URL || getDefaultWebSocketUrl());
    } catch (error) {
      state.value = "error";
      lastError.value = error.message;
      rejectLogin(error);
      return promise;
    }
    socket.value = socketInstance;

    socketInstance.addEventListener("open", () => {
      send(socketInstance, {
        type: "login",
        login: loginName,
        password,
      });
    });

    socketInstance.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      lastEvent.value = message;
      if (message.type === "status") {
        state.value = message.state;
        if (message.state === "ready") {
          resolveLogin();
        }
        if (message.state === "error") {
          const error = new Error(message.detail || "IRC login failed.");
          lastError.value = error.message;
          rejectLogin(error);
        }
      }
      if (message.type === "error") {
        lastError.value = message.message || "Server error.";
        rejectLogin(new Error(lastError.value));
      }
    });

    socketInstance.addEventListener("error", () => {
      lastError.value = "Unable to connect to the WhistleIRC server.";
      state.value = "error";
      rejectLogin(new Error(lastError.value));
    });

    socketInstance.addEventListener("close", () => {
      if (socket.value === socketInstance) {
        socket.value = null;
        state.value = "disconnected";
        rejectLogin(new Error(lastError.value || "Server connection closed."));
      }
    });

    return promise;
  }

  function logout() {
    closeSocket(true);
  }

  function joinChannel(channel) {
    return sendChannelCommand("join_channel", channel);
  }

  function partChannel(channel) {
    return sendChannelCommand("part_channel", channel);
  }

  return {
    state,
    lastError,
    lastEvent,
    login,
    logout,
    sendMessage,
    joinChannel,
    partChannel,
    setLobbyScore,
    setLobbySettings,
  };
}
