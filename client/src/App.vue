<script setup>
import { ref } from "vue";
import ChatWindow from "./components/ChatWindow.vue";
import CommandBar from "./components/CommandBar.vue";
import RoomInfoPanel from "./components/RoomInfoPanel.vue";
import PlayerListCard from "./components/PlayerListCard.vue";

const connected = ref(true);
const currentUser = "daniel";
const refereeUser = "daniel";

const messages = ref([
  { id: 1, author: "BanchoBot", text: "Room created, invite link sent." },
  { id: 2, author: "TraceXR", text: "connection's stable on my end now" },
  {
    id: 3,
    author: "daniel",
    text: "good, let's restart in 2 min",
    time: "12:04",
  },
]);

const players = ref([
  { name: "daniel", isHost: true, isReady: true, mods: [] },
  { name: "TraceXR", isHost: false, isReady: true, mods: ["HD"] },
  { name: "lover_juri", isHost: false, isReady: false, mods: [] },
]);

let nextId = 4;

function handleSend(text) {
  messages.value.push({ id: nextId++, author: currentUser, text });
}

function handleCommand(command) {
  messages.value.push({ id: nextId++, author: currentUser, text: command });
}
</script>

<template>
  <div class="app-layout">
    <ChatWindow
      title="OPTC2 referee"
      :connected="connected"
      :messages="messages"
      :current-user="currentUser"
      :referee-user="refereeUser"
      @send="handleSend"
    />

    <div class="app-layout__side">
      <RoomInfoPanel
        :size="16"
        :timer-active="false"
        format="HeadToHead"
        win-condition="Score"
        mode="osu"
      />
      <PlayerListCard :players="players" :current-user="currentUser" />
      <CommandBar @send-command="handleCommand" />
    </div>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  gap: 0.9rem;
  height: 100vh;
  padding: 1.2rem;
}

.app-layout > :first-child {
  flex: 1 1 auto;
  min-width: 0;
}

.app-layout__side {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  width: 260px;
  flex-shrink: 0;
  overflow-y: auto;
}
</style>
