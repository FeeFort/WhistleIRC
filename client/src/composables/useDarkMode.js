import { ref } from "vue";

const isDark = ref(document.documentElement.classList.contains("app-dark"));

function toggleDark() {
  isDark.value = !isDark.value;
  document.documentElement.classList.toggle("app-dark", isDark.value);
}

export function useDarkMode() {
  return { isDark, toggleDark };
}
