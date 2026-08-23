<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-vue-next';
import type { PerfectAuthMethod } from '@platforms/perfect/auth';
import PlayerAvatar from '../components/PlayerAvatar.vue';
import type { PerfectAuthApi } from '../composables/usePerfectAuth';
import { getPlatformLogo } from '../utils/platform-logos';
import { localize as l, localizeErrorMessage } from '../i18n';

const props = withDefaults(defineProps<{
  auth: PerfectAuthApi;
  initialMethod?: PerfectAuthMethod;
}>(), {
  initialMethod: 'qr',
});
const emit = defineEmits<{ back: [] }>();
const selectedMethod = ref<PerfectAuthMethod>(props.initialMethod);
const actionError = ref('');
const initialValidationPending = ref(true);
const qrTabButton = ref<HTMLButtonElement | null>(null);
const steamTabButton = ref<HTMLButtonElement | null>(null);
const nowMs = ref(Date.now());
let cooldownTimer: number | null = null;

const phaseText = computed(() => {
  switch (props.auth.status.value.phase) {
    case 'requesting': return l('正在创建登录请求…', 'Creating login request…');
    case 'waiting_scan': return l('请使用完美电竞 App 扫码', 'Scan with the Perfect Esports app');
    case 'scanned': return l('二维码已扫描', 'QR code scanned');
    case 'confirming': return l('请在 App 中确认登录', 'Confirm sign-in in the app');
    case 'validating': return l('正在验证登录状态…', 'Validating session…');
    case 'authenticated': return l('登录成功，正在进入对局检测…', 'Signed in. Starting match detection…');
    case 'expired': return l('二维码已过期，请刷新', 'QR code expired. Refresh to continue.');
    case 'cancelled': return l('登录已取消', 'Sign-in cancelled');
    case 'error': return l('登录未完成', 'Sign-in was not completed');
    default: return l('登录后才能检测完美平台对局', 'Sign in before detecting Perfect World matches');
  }
});

const rawError = computed(() => actionError.value || props.auth.status.value.error || '');
const displayError = computed(() => rawError.value ? localizeErrorMessage(rawError.value) : '');
const phoneBindingIssue = computed(() =>
  rawError.value.startsWith('PERFECT_STEAM_PHONE_REQUIRED:'),
);
const steamLoginIssue = computed(() =>
  phoneBindingIssue.value
  || rawError.value.startsWith('PERFECT_STEAM_STATE_MISMATCH:')
  || rawError.value.startsWith('PERFECT_STEAM_CALLBACK_FAILED:'),
);
const errorTitle = computed(() => {
  if (phoneBindingIssue.value) return l('需要先绑定手机号', 'Link a mobile number first');
  if (steamLoginIssue.value) return l('Steam 登录未完成', 'Steam sign-in was not completed');
  return l('登录遇到问题', 'There was a sign-in problem');
});

const phase = computed(() => props.auth.status.value.phase);
const qrCooldownLeftSec = computed(() => Math.ceil(props.auth.qrCooldownRemainingMs(nowMs.value) / 1000));
const qrCooldownActive = computed(() =>
  selectedMethod.value === 'qr'
  && qrCooldownLeftSec.value > 0
  && !['scanned', 'confirming'].includes(phase.value),
);
/** 仅在真正发起请求或进入后续验证时转圈，等待扫码不算加载 */
const primaryActionBusy = computed(() =>
  phase.value === 'requesting'
  || phase.value === 'validating'
  || phase.value === 'authenticated',
);
const primaryActionDisabled = computed(() =>
  primaryActionBusy.value
  || phase.value === 'scanned'
  || phase.value === 'confirming'
  || qrCooldownActive.value,
);

function stopCooldownClock() {
  if (cooldownTimer == null) return;
  window.clearInterval(cooldownTimer);
  cooldownTimer = null;
}

function startCooldownClock() {
  if (cooldownTimer != null) return;
  cooldownTimer = window.setInterval(() => {
    nowMs.value = Date.now();
    if (props.auth.qrCooldownRemainingMs(nowMs.value) <= 0) stopCooldownClock();
  }, 250);
}

function syncCooldownClock() {
  nowMs.value = Date.now();
  if (props.auth.qrCooldownRemainingMs(nowMs.value) > 0) startCooldownClock();
}

async function run(action: () => Promise<unknown>) {
  actionError.value = '';
  try {
    await action();
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : String(error);
  }
}

async function startQrSession() {
  await run(props.auth.startQr);
  syncCooldownClock();
}

async function refreshQr() {
  if (qrCooldownActive.value || primaryActionBusy.value || phase.value === 'scanned' || phase.value === 'confirming') return;
  await startQrSession();
}

function chooseMethod(method: PerfectAuthMethod) {
  if (selectedMethod.value === method) return;
  selectedMethod.value = method;
  if (method === 'qr') {
    if (!props.auth.hasLiveQrSession()) void startQrSession();
  } else {
    void run(props.auth.startSteam);
  }
}

function onMethodKeydown(event: KeyboardEvent) {
  let method: PerfectAuthMethod | null = null;
  if (event.key === 'Home') method = 'qr';
  else if (event.key === 'End') method = 'steam';
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    method = selectedMethod.value === 'qr' ? 'steam' : 'qr';
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    method = selectedMethod.value === 'qr' ? 'steam' : 'qr';
  }
  if (!method) return;
  event.preventDefault();
  chooseMethod(method);
  void nextTick(() => {
    (method === 'qr' ? qrTabButton.value : steamTabButton.value)?.focus();
  });
}

async function goBack() {
  emit('back');
}

onMounted(async () => {
  try {
    syncCooldownClock();
    if (props.auth.hasLiveQrSession()) return;
    const current = await props.auth.validate().catch(() => props.auth.status.value);
    if (current.phase === 'authenticated') return;
    if (props.auth.hasLiveQrSession()) return;
    if (selectedMethod.value === 'qr') {
      await startQrSession();
    } else {
      await run(props.auth.startSteam);
    }
  } finally {
    initialValidationPending.value = false;
  }
});

onUnmounted(() => {
  stopCooldownClock();
});
</script>

<template>
  <div class="relative flex min-h-full items-center justify-center overflow-auto bg-base px-6 py-5 sm:px-10 sm:py-6">
    <button
      type="button"
      class="absolute left-6 top-6 flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-3 text-[13px] font-medium text-fg-secondary transition-colors hover:bg-elevated hover:text-fg disabled:opacity-50"
      @click="goBack"
    >
      <ArrowLeft class="h-4 w-4" aria-hidden="true" />
      {{ l('更换平台', 'Change platform') }}
    </button>

    <section class="min-h-128 w-full max-w-lg" aria-labelledby="perfect-auth-title">
      <header class="flex items-center gap-3 border-b border-border pb-5">
        <img :src="getPlatformLogo('perfect').src" :alt="getPlatformLogo('perfect').alt" class="h-12 w-12 object-contain" />
        <div>
          <h1 id="perfect-auth-title" class="text-balance text-lg font-semibold text-fg">{{ l('登录完美平台', 'Sign in to Perfect World') }}</h1>
          <p class="mt-1 text-[12px] leading-relaxed text-fg-secondary">{{ l('任意账号可查看战绩，本局账号还能自动识别敌我', 'Use any account to view stats. Your match account also identifies both sides.') }}</p>
        </div>
      </header>

      <div
        v-if="!initialValidationPending && auth.status.value.phase !== 'authenticated'"
        class="mt-5 grid w-full grid-cols-2 gap-1.5 rounded-lg bg-elevated p-1.5"
        role="tablist"
        :aria-label="l('选择登录方式', 'Choose a sign-in method')"
      >
        <button
          ref="qrTabButton"
          type="button"
          role="tab"
          id="perfect-auth-tab-qr"
          class="group flex min-h-16 cursor-pointer items-center gap-3 rounded-md px-3 text-left transition-[color,background-color,box-shadow,scale] duration-200 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          :class="selectedMethod === 'qr'
            ? 'bg-surface text-fg shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_-1px_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.04)]'
            : 'text-fg-muted hover:bg-surface/55 hover:text-fg-secondary'"
          :aria-selected="selectedMethod === 'qr'"
          aria-controls="perfect-auth-panel-qr"
          :tabindex="selectedMethod === 'qr' ? 0 : -1"
          @click="chooseMethod('qr')"
          @keydown="onMethodKeydown"
        >
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-[color,background-color,scale] duration-200 ease-out group-active:scale-[0.96]"
            :class="selectedMethod === 'qr' ? 'bg-accent/12 text-accent' : 'bg-surface/70 text-fg-muted'"
          >
            <QrCode class="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <span class="min-w-0">
            <span class="block text-[12px] font-semibold">{{ l('完美电竞 App', 'Perfect Esports app') }}</span>
            <span class="mt-0.5 block text-[10px] text-fg-muted">{{ l('扫码登录 · 推荐', 'QR sign-in · Recommended') }}</span>
          </span>
        </button>
        <button
          ref="steamTabButton"
          type="button"
          role="tab"
          id="perfect-auth-tab-steam"
          class="group flex min-h-16 cursor-pointer items-center gap-3 rounded-md px-3 text-left transition-[color,background-color,box-shadow,scale] duration-200 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          :class="selectedMethod === 'steam'
            ? 'bg-surface text-fg shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_-1px_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.04)]'
            : 'text-fg-muted hover:bg-surface/55 hover:text-fg-secondary'"
          :aria-selected="selectedMethod === 'steam'"
          aria-controls="perfect-auth-panel-steam"
          :tabindex="selectedMethod === 'steam' ? 0 : -1"
          @click="chooseMethod('steam')"
          @keydown="onMethodKeydown"
        >
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-[color,background-color,scale] duration-200 ease-out group-active:scale-[0.96]"
            :class="selectedMethod === 'steam' ? 'bg-accent/12 text-accent' : 'bg-surface/70 text-fg-muted'"
          >
            <ShieldCheck class="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <span class="min-w-0">
            <span class="block text-[12px] font-semibold">{{ l('Steam 网页登录', 'Steam web sign-in') }}</span>
            <span class="mt-0.5 block text-[10px] text-fg-muted">{{ l('独立窗口登录 · 备选', 'Separate window · Alternative') }}</span>
          </span>
        </button>
      </div>

      <Transition name="auth-stage" mode="out-in">
        <div
          v-if="initialValidationPending"
          key="initial-validation"
          class="mt-6 flex min-h-62.5 flex-col items-center justify-center text-center"
          aria-live="polite"
          aria-busy="true"
        >
          <span class="auth-check-pulse relative flex h-16 w-16 items-center justify-center rounded-xl bg-accent/10 text-accent shadow-[0_0_0_1px_rgba(74,144,226,0.10),0_8px_24px_rgba(74,144,226,0.08)]">
            <Loader2 class="h-7 w-7 animate-spin" aria-hidden="true" />
          </span>
          <p class="mt-5 text-balance text-[14px] font-semibold text-fg">
            {{ l('正在检查登录状态', 'Checking sign-in status') }}
          </p>
          <p class="mt-2 max-w-xs text-pretty text-[12px] leading-relaxed text-fg-muted">
            {{ l('正在确认已保存的完美平台账号是否仍然有效', 'Confirming that the saved Perfect World account is still valid.') }}
          </p>
        </div>

        <div v-else key="auth-resolved" class="mt-6 flex min-h-62.5 flex-col items-center justify-center">
        <template v-if="auth.status.value.phase === 'authenticated'">
          <div
            class="w-full max-w-sm rounded-lg bg-surface p-4 shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_-1px_rgba(0,0,0,0.06),0_2px_4px_rgba(0,0,0,0.04)]"
          >
            <div class="flex items-center gap-4">
              <div class="relative shrink-0">
                <PlayerAvatar
                  :src="auth.status.value.avatar"
                  :alt="auth.status.value.name || l('完美平台用户', 'Perfect World user')"
                  size="xl"
                  shape="rounded"
                  class="outline-1 -outline-offset-1 outline-black/10"
                />
                <span
                  class="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-success text-white shadow-[0_0_0_2px_var(--color-surface)]"
                  :aria-label="l('登录状态有效', 'Session valid')"
                >
                  <Check class="h-3 w-3 stroke-3" aria-hidden="true" />
                </span>
              </div>

              <div class="min-w-0 flex-1 text-left">
                <p class="text-[10px] font-medium text-fg-muted">
                  {{ l('完美平台账号', 'Perfect World account') }}
                </p>
                <p class="mt-1 truncate text-[16px] font-semibold text-fg">
                  {{ auth.status.value.name || l('完美平台用户', 'Perfect World user') }}
                </p>
                <p class="mt-1 font-mono text-[11px] tabular-nums text-fg-muted">
                  SteamID {{ auth.status.value.uid }}
                </p>
              </div>
            </div>

            <div class="mt-4 flex items-center gap-2 border-t border-border pt-3 text-[11px] text-fg-secondary">
              <Loader2 class="h-3.5 w-3.5 shrink-0 animate-spin text-accent" aria-hidden="true" />
              <span class="text-pretty">
                {{ l('凭据验证通过，正在启动对局检测', 'Session verified. Starting match detection') }}
              </span>
            </div>
          </div>
        </template>
        <Transition v-else name="auth-method" mode="out-in">
          <div
            v-if="selectedMethod === 'qr'"
            id="perfect-auth-panel-qr"
            key="qr"
            class="auth-method-panel flex flex-col items-center"
            role="tabpanel"
            aria-labelledby="perfect-auth-tab-qr"
          >
            <div class="flex h-55 w-55 items-center justify-center rounded-md border border-border bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <img
                v-if="auth.status.value.qrImageDataUrl"
                :src="auth.status.value.qrImageDataUrl"
                :alt="l('完美电竞 App 登录二维码', 'Perfect Esports app sign-in QR code')"
                class="h-full w-full object-contain outline-1 -outline-offset-1 outline-black/10"
              />
              <Loader2 v-else-if="auth.busy.value" class="h-8 w-8 animate-spin text-accent" aria-hidden="true" />
              <QrCode v-else class="h-14 w-14 text-border" aria-hidden="true" />
            </div>
          </div>
          <div
            v-else
            id="perfect-auth-panel-steam"
            key="steam"
            class="auth-method-panel flex max-w-sm flex-col items-center text-center"
            role="tabpanel"
            aria-labelledby="perfect-auth-tab-steam"
          >
            <span class="flex h-16 w-16 items-center justify-center rounded-lg bg-accent/10 text-accent shadow-[0_0_0_1px_rgba(0,0,0,0.04)]">
              <ShieldCheck class="h-8 w-8" aria-hidden="true" />
            </span>
            <p class="mt-4 text-balance text-[14px] font-semibold text-fg">
              {{ l('在独立窗口中登录 Steam', 'Sign in to Steam in a separate window') }}
            </p>
            <p class="mt-2 text-pretty text-[12px] leading-relaxed text-fg-muted">
              {{ l('登录完成后窗口会自动关闭，并返回助手继续验证。', 'The window closes automatically after sign-in, then the assistant continues validation.') }}
            </p>
          </div>
        </Transition>

        <p
          v-if="auth.status.value.phase !== 'authenticated' && !displayError"
          class="mt-4 text-center text-[13px] font-medium text-fg-secondary"
          aria-live="polite"
        >
          {{ phaseText }}
        </p>
        <span v-else class="sr-only" aria-live="polite">{{ phaseText }}</span>
        <div
          v-if="displayError"
          class="mt-4 flex w-full max-w-md items-start gap-3 rounded-lg bg-warning/10 p-3.5 text-left shadow-[0_0_0_1px_rgba(245,158,11,0.18),0_1px_2px_-1px_rgba(0,0,0,0.06)]"
          role="alert"
          aria-live="assertive"
        >
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warning/15 text-warning">
            <Smartphone v-if="phoneBindingIssue" class="h-4.5 w-4.5" aria-hidden="true" />
            <AlertTriangle v-else class="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <div class="min-w-0 pt-0.5">
            <p class="text-balance text-[12px] font-semibold text-fg">{{ errorTitle }}</p>
            <p class="mt-1 text-pretty text-[11px] leading-relaxed text-fg-secondary">
              {{ displayError }}
            </p>
          </div>
        </div>
        </div>
      </Transition>

      <Transition name="auth-stage">
      <footer
        v-if="!initialValidationPending"
        class="mt-4 flex items-center justify-center border-t border-border pt-4"
      >
        <button
          type="button"
          class="flex min-h-10 cursor-pointer items-center gap-2 rounded-md bg-accent px-4 text-[12px] font-medium text-white transition-[background-color,opacity,scale] duration-150 ease-out hover:bg-accent-hover active:scale-[0.96] disabled:opacity-60 disabled:active:scale-100"
          :class="[
            primaryActionBusy ? 'disabled:cursor-wait' : 'disabled:cursor-not-allowed',
            qrCooldownActive ? 'tabular-nums' : '',
          ]"
          :disabled="primaryActionDisabled"
          @click="selectedMethod === 'qr' ? refreshQr() : run(auth.startSteam)"
        >
          <Loader2
            v-if="primaryActionBusy"
            class="h-4 w-4 animate-spin"
            aria-hidden="true"
          />
          <RefreshCw v-else class="h-4 w-4" aria-hidden="true" />
          {{ auth.status.value.phase === 'authenticated'
            ? l('正在进入检测', 'Starting detection')
            : selectedMethod === 'qr'
              ? qrCooldownActive
                ? l(`重新获取 ${qrCooldownLeftSec}s`, `Refresh in ${qrCooldownLeftSec}s`)
                : l('重新获取二维码', 'Refresh QR code')
              : phoneBindingIssue
                ? l('绑定后重新登录', 'Sign in again after linking')
                : l('打开 Steam 登录', 'Open Steam sign-in') }}
        </button>
      </footer>
      </Transition>
    </section>
  </div>
</template>

<style scoped>
.auth-method-enter-active,
.auth-method-leave-active {
  transition:
    opacity 180ms cubic-bezier(0.2, 0, 0, 1),
    transform 180ms cubic-bezier(0.2, 0, 0, 1),
    filter 180ms cubic-bezier(0.2, 0, 0, 1);
}

.auth-method-leave-active {
  transition-duration: 130ms;
}

.auth-method-enter-from {
  opacity: 0;
  transform: translate3d(10px, 0, 0);
  filter: blur(4px);
}

.auth-method-leave-to {
  opacity: 0;
  transform: translate3d(-8px, 0, 0);
  filter: blur(4px);
}

.auth-stage-enter-active {
  transition:
    opacity 280ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 280ms cubic-bezier(0.16, 1, 0.3, 1);
}

.auth-stage-leave-active {
  transition:
    opacity 140ms ease-in,
    transform 140ms ease-in;
}

.auth-stage-enter-from {
  opacity: 0;
  transform: translate3d(0, 8px, 0);
}

.auth-stage-leave-to {
  opacity: 0;
  transform: translate3d(0, -4px, 0);
}

.auth-check-pulse::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  box-shadow: 0 0 0 1px rgba(74, 144, 226, 0.18);
  animation: auth-check-pulse 1.8s ease-out infinite;
  pointer-events: none;
}

@keyframes auth-check-pulse {
  0% {
    opacity: 0.65;
    transform: scale(1);
  }
  70%,
  100% {
    opacity: 0;
    transform: scale(1.24);
  }
}
</style>
