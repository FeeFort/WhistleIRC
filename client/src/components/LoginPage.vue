<script setup>
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Password from "primevue/password";
import ToggleSwitch from "primevue/toggleswitch";
import { ArrowRight, Copy, ExternalLink, KeyRound, LogIn, LogOut, TriangleAlert } from "@lucide/vue";
import { getOsuRedirectUri } from "../composables/useOsuOAuth";

const props = defineProps({
  initialLogin: { type: String, default: "" },
  osuClientId: { type: String, default: "" },
  osuClientSecret: { type: String, default: "" },
  osuProfile: { type: Object, default: null },
  osuLoading: { type: Boolean, default: false },
  osuError: { type: String, default: "" },
  loading: { type: Boolean, default: false },
});
const emit = defineEmits(["login", "save-osu-credentials", "osu-login", "osu-logout", "copy-callback"]);

const login = ref(props.initialLogin);
const password = ref("");
const clientId = ref(props.osuClientId);
const clientSecret = ref(props.osuClientSecret);
const rememberMe = ref(false);
const submitted = ref(false);
const osuSubmitted = ref(false);
const setupStep = ref(props.osuClientId ? 2 : 1);
const showSetup = computed(() => !props.osuProfile);
const redirectUri = getOsuRedirectUri();
const currentStepText = computed(() => (setupStep.value === 1 ? "Step 1 of 3 · Enter your osu! app credentials" : "Step 2 of 3 · Authorize your osu! account"));

const canSubmit = () => login.value.trim() && password.value;

function submit() {
  submitted.value = true;
  if (props.loading || !canSubmit()) return;

  emit("login", {
    username: login.value.trim(),
    password: password.value,
    rememberMe: rememberMe.value,
  });
}

function saveOsuCredentials() {
  osuSubmitted.value = true;
  if (!clientId.value.trim() || !clientSecret.value) return;

  emit("save-osu-credentials", {
    clientId: clientId.value.trim(),
    clientSecret: clientSecret.value,
  });
  setupStep.value = 2;
}

function loginFromOsu() {
  if (!clientId.value.trim() || !clientSecret.value || props.osuLoading) return;
  setupStep.value = 2;
  emit("osu-login", {
    clientId: clientId.value.trim(),
    clientSecret: clientSecret.value,
  });
}

function editCredentials() {
  osuSubmitted.value = false;
  setupStep.value = 1;
}

function logoutFromOsu() {
  emit("osu-logout");
}

async function copyCallbackUrl() {
  try {
    await navigator.clipboard.writeText(redirectUri);
    emit("copy-callback");
  } catch {
    return;
  }
}

watch(
  () => props.osuClientId,
  (value) => {
    clientId.value = value;
    if (value && setupStep.value === 1) setupStep.value = 2;
  },
);

watch(
  () => props.osuClientSecret,
  (value) => {
    clientSecret.value = value;
  },
);

watch(
  () => props.osuProfile,
  (profile) => {
    login.value = profile?.username || props.initialLogin;
  },
  { immediate: true },
);
</script>

<template>
  <main class="login-page">
    <section class="login-card" aria-labelledby="login-title">
      <div class="login-card__brand">
        <span class="login-card__brand-mark">Whistle</span>
        <span>IRC</span>
      </div>

      <div v-if="showSetup" class="login-setup">
        <div class="login-setup__intro">
          <h1>Connect your osu! account</h1>
          <p>Complete these steps once. After that, you can log in with IRC.</p>
          <div class="login-progress" role="progressbar" :aria-valuenow="setupStep" aria-valuemin="1" aria-valuemax="3" :aria-label="currentStepText">
            <div class="login-progress__track">
              <span class="login-progress__fill" :style="{ width: `${((setupStep - 1) / 2) * 100}%` }" />
            </div>
            <span v-for="step in 3" :key="step" class="login-progress__step" :class="{ 'login-progress__step--active': setupStep >= step }">
              {{ step }}
            </span>
          </div>
          <p class="login-progress__label">{{ currentStepText }}</p>
        </div>

        <form v-if="setupStep === 1" class="login-form" @submit.prevent="saveOsuCredentials">
          <label class="login-form__field">
            <span class="login-form__label">Client ID</span>
            <InputText v-model="clientId" autocomplete="off" placeholder="Enter your osu! client ID" :invalid="osuSubmitted && !clientId.trim()" />
          </label>
          <label class="login-form__field">
            <span class="login-form__label">Client secret</span>
            <Password v-model="clientSecret" autocomplete="off" placeholder="Enter your osu! client secret" :feedback="false" toggleMask :invalid="osuSubmitted && !clientSecret" />
          </label>
          <div class="login-callback-warning">
            <TriangleAlert :size="15" class="login-callback-warning__icon" />
            <div class="login-callback-warning__content">
              <span>Create an OAuth application and set this callback URL:</span>
              <button type="button" class="login-callback" title="Copy callback URL" @click="copyCallbackUrl">
                <Copy :size="14" />
                <code>{{ redirectUri }}</code>
              </button>
            </div>
          </div>
          <Button type="submit" class="login-form__submit"><KeyRound :size="15" /><span>Save and continue</span><ArrowRight :size="15" /></Button>
        </form>

        <div v-else class="login-form">
          <div class="login-callback-warning">
            <TriangleAlert :size="15" class="login-callback-warning__icon" />
            <div class="login-callback-warning__content">
              <span>Use this exact callback URL in your osu! application:</span>
              <button type="button" class="login-callback" title="Copy callback URL" @click="copyCallbackUrl">
                <Copy :size="14" />
                <code>{{ redirectUri }}</code>
              </button>
            </div>
          </div>
          <p class="login-form__hint">Authorize WhistleIRC in osu! to connect your profile.</p>
          <p v-if="osuError" class="login-form__error">{{ osuError }}</p>
          <Button class="login-form__submit" :loading="osuLoading" :disabled="osuLoading" @click="loginFromOsu"><ExternalLink :size="15" /><span>Login from osu!</span></Button>
          <Button text class="login-form__secondary" :disabled="osuLoading" @click="editCredentials">Edit credentials</Button>
        </div>
      </div>

      <div v-if="!showSetup" class="login-form__osu-profile">
        <img :src="osuProfile.avatarUrl" alt="" />
        <div>
          <span>osu! account</span><strong>{{ osuProfile.username }}</strong>
        </div>
        <Button text class="login-form__osu-logout" aria-label="Log out from osu!" title="Log out from osu!" @click="logoutFromOsu">
          <LogOut :size="15" />
        </Button>
      </div>

      <form v-if="!showSetup" class="login-form" @submit.prevent="submit">
        <label class="login-form__field">
          <span class="login-form__label">IRC login</span>
          <InputText v-model="login" autocomplete="username" autofocus placeholder="Enter your login" :disabled="true" :invalid="submitted && !login.trim()" />
        </label>

        <label class="login-form__field">
          <span class="login-form__label">Password</span>
          <Password
            v-model="password"
            inputId="irc-password"
            autocomplete="current-password"
            placeholder="Enter your password"
            :feedback="false"
            toggleMask
            :disabled="loading"
            :invalid="submitted && !password"
          />
        </label>

        <div class="login-form__options">
          <div class="login-form__remember">
            <ToggleSwitch v-model="rememberMe" inputId="remember-me" :disabled="loading" class="app-solid-switch" />
            <label for="remember-me">Remember me</label>
          </div>
        </div>

        <Button type="submit" :loading="loading" :disabled="loading" class="login-form__submit">
          <LogIn :size="15" />
          <span>Login</span>
        </Button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 1.25rem;
}

.login-card {
  width: min(100%, 29rem);
  padding: 1.7rem;
  border: 1px solid var(--app-border);
  border-radius: 1rem;
  background: var(--app-panel-gradient);
  box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.28);
}

.login-setup__intro {
  margin-bottom: 1.3rem;
}

.login-progress {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 1.55rem;
  margin-top: 1rem;
}

.login-progress__track {
  position: absolute;
  top: 50%;
  right: 0.7rem;
  left: 0.7rem;
  height: 0.2rem;
  overflow: hidden;
  transform: translateY(-50%);
  border-radius: 99rem;
  background: var(--app-border);
}

.login-progress__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--app-primary), var(--app-primary-bright));
  transition: width 320ms ease;
}

.login-progress__step {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.55rem;
  height: 1.55rem;
  border: 1px solid var(--app-border-strong);
  border-radius: 50%;
  background: var(--app-surface-raised);
  color: var(--app-muted);
  font-size: 0.66rem;
  font-weight: 800;
  transition:
    background-color 320ms ease,
    border-color 320ms ease,
    color 320ms ease,
    transform 320ms ease;
}

.login-progress__step--active {
  border-color: var(--app-primary);
  background: var(--app-primary);
  color: var(--app-bg);
  transform: scale(1.08);
}

.login-setup__intro h1 {
  margin: 0.35rem 0 0;
  color: var(--app-text);
  font-size: 1.25rem;
}

.login-setup__intro p {
  margin: 0.45rem 0 0;
  color: var(--app-muted);
  font-size: 0.76rem;
  line-height: 1.45;
}

.login-progress__label {
  margin-top: 0.45rem !important;
  font-size: 0.68rem !important;
}

.login-card__brand {
  margin-bottom: 2rem;
  color: var(--app-text);
  font-family: "Nunito", "Manrope", sans-serif;
  font-size: 1.45rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.login-card__brand-mark {
  color: var(--app-primary);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.login-form__field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.login-form__label {
  color: var(--app-muted);
  font-size: 0.72rem;
  font-weight: 700;
}

.login-form__hint {
  margin: -0.2rem 0 0;
  color: var(--app-muted);
  font-size: 0.68rem;
  line-height: 1.5;
}

.login-form__hint code {
  color: var(--app-primary-bright);
  font-family: ui-monospace, Consolas, monospace;
  overflow-wrap: anywhere;
}

.login-callback-warning {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  margin-top: 0;
  padding: 0.65rem 0.75rem;
  border: 1px solid rgba(245, 190, 66, 0.26);
  border-radius: 0.65rem;
  background: rgba(245, 190, 66, 0.08);
  color: var(--app-muted);
  font-size: 0.68rem;
  line-height: 1.4;
}

.login-callback-warning__icon {
  flex: 0 0 auto;
  width: 0.95rem;
  height: 0.95rem;
  margin-top: 0.05rem;
  color: #f5be42;
}

.login-callback-warning__content {
  display: grid;
  min-width: 0;
  gap: 0.3rem;
  color: #f5be42;
}

.login-callback {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--app-primary-bright);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.login-callback:hover {
  color: var(--app-text);
}

.login-callback svg {
  flex: 0 0 auto;
  width: 0.8rem;
  height: 0.8rem;
  margin-top: 0.08rem;
}

.login-callback code {
  overflow-wrap: anywhere;
  font-family: ui-monospace, Consolas, monospace;
}

.login-form__error {
  margin: -0.25rem 0 0;
  color: #ff8f9a;
  font-size: 0.72rem;
  line-height: 1.4;
}

.login-form__osu-profile {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

.login-form__osu-profile strong,
.login-form__osu-profile span {
  display: block;
}

.login-form__osu-profile strong {
  color: var(--app-text);
  font-size: 0.76rem;
}

.login-form__osu-profile span {
  margin-top: 0.15rem;
  color: var(--app-muted);
  font-size: 0.68rem;
}

.login-form__osu-profile {
  margin: -0.25rem 0 1.3rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--app-border);
}

.login-form__osu-profile > div {
  min-width: 0;
}

.login-form__osu-profile img {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  object-fit: cover;
}

.login-form__osu-logout {
  width: 2rem;
  height: 2rem;
  flex: 0 0 auto;
  margin-left: auto;
  padding: 0;
  color: var(--app-muted) !important;
}

.login-form__osu-logout:hover {
  color: var(--app-red) !important;
  background: rgba(255, 107, 126, 0.12) !important;
}

.login-form__secondary {
  justify-content: center;
  color: var(--app-muted) !important;
  font-size: 0.72rem;
}

.login-form__field :deep(.p-inputtext),
.login-form__field :deep(.p-password),
.login-form__field :deep(.p-password-input) {
  width: 100%;
}

.login-form__field :deep(.p-inputtext),
.login-form__field :deep(.p-password-input) {
  min-height: 2.6rem;
  border: 1px solid var(--app-border);
  border-radius: 0.6rem;
  background: var(--app-control);
  color: var(--app-text);
  box-shadow: none;
}

.login-form__field :deep(.p-inputtext:focus),
.login-form__field :deep(.p-password-input:focus) {
  border-color: var(--app-primary-bright);
  box-shadow: 0 0 0 0.15rem rgba(var(--app-primary-rgb), 0.16);
}

.login-form__field :deep(.p-inputtext::placeholder),
.login-form__field :deep(.p-password-input::placeholder) {
  color: var(--app-muted);
}

.login-form__field :deep(.p-password .p-icon-field) {
  width: 100%;
}

.login-form__field :deep(.p-password-toggle-mask-icon) {
  color: var(--app-muted);
}

.login-form__options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 1.5rem;
}

.login-form__remember {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--app-muted);
  font-size: 0.72rem;
}

.login-form__remember label {
  cursor: pointer;
}

.login-form__submit {
  justify-content: center;
  gap: 0.4rem;
  width: 100%;
  min-height: 2.6rem;
  margin-top: 0.2rem;
  border-color: var(--app-primary) !important;
  border-radius: 0.6rem;
  background: var(--app-primary) !important;
  color: var(--app-bg) !important;
  font-size: 0.76rem;
  font-weight: 800;
}

.login-form__submit:hover:not(:disabled) {
  border-color: var(--app-primary-bright) !important;
  background: var(--app-primary-bright) !important;
}

@media (max-width: 480px) {
  .login-page {
    padding: 0.8rem;
  }

  .login-card {
    padding: 1.3rem;
  }

  .login-progress {
    margin-top: 0.8rem;
  }
}
</style>
