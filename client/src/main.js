import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import PrimeVue from "primevue/config";
import Tooltip from "primevue/tooltip";
import Aura from "@primeuix/themes/aura";

const app = createApp(App);

app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: ".app-dark",
    },
  },
});
app.directive("tooltip", Tooltip);

app.mount("#app");
