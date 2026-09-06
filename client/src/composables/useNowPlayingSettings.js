import { ref, watch } from "vue";

const STORAGE_KEY = "feeirc-now-playing-settings";
const showNowPlaying = ref(localStorage.getItem(STORAGE_KEY) !== "false");
const showProgressBar = ref(localStorage.getItem(`${STORAGE_KEY}-progress`) !== "false");
const showProgressTimeLabel = ref(localStorage.getItem(`${STORAGE_KEY}-progress-label`) !== "false");
watch(showNowPlaying, (value) => localStorage.setItem(STORAGE_KEY, String(value)));
watch(showProgressBar, (value) => localStorage.setItem(`${STORAGE_KEY}-progress`, String(value)));
watch(showProgressTimeLabel, (value) => localStorage.setItem(`${STORAGE_KEY}-progress-label`, String(value)));
export function useNowPlayingSettings() {
  return { showNowPlaying, showProgressBar, showProgressTimeLabel };
}
