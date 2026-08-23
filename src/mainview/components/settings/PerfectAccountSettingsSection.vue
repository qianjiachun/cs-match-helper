<script setup lang="ts">
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Copy,
  Globe2,
  Loader2,
  LogOut,
  QrCode,
  RefreshCw,
  Smartphone,
} from 'lucide-vue-next';
import { computed, onUnmounted, ref, watch } from 'vue';
import type { PerfectAuthMethod, PerfectAuthStatus } from '@platforms/perfect/auth';
import type { PerfectAuthApi } from '../../composables/usePerfectAuth';
import perfectLogo from '../../assets/platforms/logo-perfect.png';
import { useCopyFeedback } from '../../composables/useCopyFeedback';
import { localize as l, localizeErrorMessage } from '../../i18n';
import LogoutConfirmDialog from '../LogoutConfirmDialog.vue';
import PlayerAvatar from '../PlayerAvatar.vue';
import SettingsCard from './SettingsCard.vue';

const AUTO_VALIDATION_MAX_AGE_MS = 60 * 60 * 1000;

type AccountSnapshot = Pick<PerfectAuthStatus, 'avatar' | 'uid' | 'method' | 'name'>;

const props = defineProps<{
  auth: PerfectAuthApi;
  visible?: boolean;
}>();

const emit = defineEmits<{ login: [method: PerfectAuthMethod] }>();

const action = ref<'idle' | 'verify' | 'logout'>('idle');
const actionError = ref('');
const logoutDialogOpen = ref(false);
const accountSnapshot = ref<AccountSnapshot | null>(null);
const steamIdCopied = ref(false);
const { copyText } = useCopyFeedback();
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

const authenticated = computed(() => props.auth.status.value.phase === 'authenticated');
const checking = computed(() => action.value === 'verify' || props.auth.status.value.phase === 'validating');
const working = computed(() => action.value !== 'idle');
const hasKnownAccount = computed(() => accountSnapshot.value != null);

const statusText = computed(() => {
  if (checking.value) return l('正在检查', 'Checking');
  if (authenticated.value) return l('已登录', 'Signed in');
  if (props.auth.status.value.phase === 'error' && hasKnownAccount.value) {
    return l('检查失败', 'Check failed');
  }
  return l('登录已失效', 'Session unavailable');
});

const statusClass = computed(() => {
  if (checking.value) return 'bg-accent/10 text-accent';
  if (authenticated.value) return 'bg-success/10 text-success';
  return 'bg-warning/10 text-warning';
});

const methodText = computed(() => {
  if (accountSnapshot.value?.method === 'steam') return l('Steam 网页登录', 'Steam web sign-in');
  if (accountSnapshot.value?.method === 'qr') return l('完美电竞 App 扫码', 'Perfect Esports app QR');
  return l('未记录', 'Not available');
});

const methodIcon = computed(() => (accountSnapshot.value?.method === 'qr' ? Smartphone : Globe2));

const displayError = computed(() => {
  const error = actionError.value || props.auth.status.value.error || '';
  return error ? localizeErrorMessage(error) : '';
});

watch(
  () => props.auth.status.value,
  (status) => {
    if (status.phase === 'authenticated') {
      accountSnapshot.value = {
        avatar: status.avatar,
        uid: status.uid,
        method: status.method,
        name: status.name,
      };
      return;
    }

    if (status.uid) {
      accountSnapshot.value = {
        avatar: status.avatar ?? accountSnapshot.value?.avatar,
        uid: status.uid,
        method: status.method ?? accountSnapshot.value?.method,
        name: status.name ?? accountSnapshot.value?.name,
      };
      return;
    }

    if (['idle', 'expired', 'cancelled', 'error'].includes(status.phase)) {
      accountSnapshot.value = null;
    }
  },
  { immediate: true },
);

async function verify() {
  if (working.value) return;
  action.value = 'verify';
  actionError.value = '';
  try {
    await props.auth.validate();
  } catch (error) {
    actionError.value = localizeErrorMessage(error);
  } finally {
    action.value = 'idle';
  }
}

async function verifyAutomatically() {
  if (authenticated.value && props.auth.validationIsFresh(AUTO_VALIDATION_MAX_AGE_MS)) return;
  if (working.value) return;
  action.value = 'verify';
  actionError.value = '';
  try {
    await props.auth.validateIfStale(AUTO_VALIDATION_MAX_AGE_MS);
  } catch (error) {
    actionError.value = localizeErrorMessage(error);
  } finally {
    action.value = 'idle';
  }
}

async function logout() {
  if (working.value) return;
  action.value = 'logout';
  actionError.value = '';
  try {
    await props.auth.clear();
    logoutDialogOpen.value = false;
  } catch (error) {
    actionError.value = localizeErrorMessage(error);
    logoutDialogOpen.value = false;
  } finally {
    action.value = 'idle';
  }
}

function openLogin(method: PerfectAuthMethod) {
  if (!working.value) emit('login', method);
}

async function copySteamId() {
  const uid = accountSnapshot.value?.uid;
  if (!uid) return;
  const copied = await copyText(uid, { showToast: false });
  if (!copied) return;
  steamIdCopied.value = true;
  if (copiedTimer) clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    steamIdCopied.value = false;
  }, 1600);
}

onUnmounted(() => {
  if (copiedTimer) clearTimeout(copiedTimer);
});

watch(
  () => props.visible,
  (visible) => {
    if (visible) void verifyAutomatically();
  },
  { immediate: true },
);
</script>

<template>
  <div class="space-y-5">
    <SettingsCard
      :title="l('完美平台账号', 'Perfect World account')"
      :description="l('可使用任意账号，登录仅用于查看战绩；若使用本局参赛账号，还可自动识别我方与对方', 'Use any account to view match data. Signing in with an account in the current match also identifies your team and the opponents automatically.')"
      :icon-src="perfectLogo"
    >
      <Transition name="auth-panel" mode="out-in">
        <div v-if="hasKnownAccount" key="account" class="account-surface overflow-hidden rounded-xl">
          <div class="flex min-h-23 items-center gap-4 px-4 py-4 sm:px-5">
            <PlayerAvatar
              v-if="accountSnapshot?.avatar"
              :src="accountSnapshot.avatar"
              :alt="accountSnapshot.name || l('完美平台账号', 'Perfect World account')"
              size="xl"
              shape="rounded"
              class="shrink-0 outline-1 -outline-offset-1 outline-black/10"
            />
            <div
              v-else
              class="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-surface text-fg-muted shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
              :aria-label="l('完美平台账号', 'Perfect World account')"
            >
              <CircleUserRound class="h-7 w-7" aria-hidden="true" />
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <p class="max-w-full truncate text-[15px] font-semibold text-fg">
                  {{ accountSnapshot?.name || l('完美平台账号', 'Perfect World account') }}
                </p>
                <span
                  class="inline-flex min-h-5 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium transition-[color,background-color] duration-200 ease-out"
                  :class="statusClass"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <span class="relative h-3 w-3 shrink-0" aria-hidden="true">
                    <Loader2
                      class="absolute inset-0 h-3 w-3 animate-spin transition-[opacity,scale,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
                      :class="checking ? 'scale-100 opacity-100 blur-0' : 'scale-[0.25] opacity-0 blur-xs'"
                    />
                    <CheckCircle2
                      class="absolute inset-0 h-3 w-3 transition-[opacity,scale,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
                      :class="checking ? 'scale-[0.25] opacity-0 blur-xs' : 'scale-100 opacity-100 blur-0'"
                    />
                  </span>
                  {{ statusText }}
                </span>
              </div>
              <button
                v-if="accountSnapshot?.uid"
                type="button"
                class="relative -ml-1 mt-1 inline-flex h-6 cursor-pointer items-center gap-2 rounded-md px-1 font-mono text-[11px] tabular-nums text-fg-muted transition-[color,background-color,scale] duration-150 ease-out after:absolute after:left-0 after:top-1/2 after:h-10 after:w-full after:-translate-y-1/2 after:content-[''] hover:bg-surface hover:text-fg-secondary active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                :aria-label="l(`复制 SteamID ${accountSnapshot.uid}`, `Copy SteamID ${accountSnapshot.uid}`)"
                @click="copySteamId"
              >
                <span>SteamID {{ accountSnapshot.uid }}</span>
                <span class="inline-flex min-w-13 items-center gap-1 text-[10px] font-sans font-medium" :class="steamIdCopied ? 'text-success' : 'text-fg-muted'">
                  <span class="relative h-3 w-3 shrink-0" aria-hidden="true">
                    <Check
                      class="absolute inset-0 h-3 w-3 transition-[opacity,scale,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
                      :class="steamIdCopied ? 'scale-100 opacity-100 blur-0' : 'scale-[0.25] opacity-0 blur-xs'"
                    />
                    <Copy
                      class="absolute inset-0 h-3 w-3 transition-[opacity,scale,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
                      :class="steamIdCopied ? 'scale-[0.25] opacity-0 blur-xs' : 'scale-100 opacity-100 blur-0'"
                    />
                  </span>
                  {{ steamIdCopied ? l('已复制', 'Copied') : l('复制', 'Copy') }}
                </span>
              </button>
              <p v-else class="mt-1.5 text-[11px] text-fg-muted">
                {{ l('账号标识暂不可用', 'Account ID unavailable') }}
              </p>
            </div>
          </div>

          <div class="grid gap-3 border-t border-border-subtle bg-surface/70 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
            <div class="flex min-w-0 items-center gap-3">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
                <component :is="methodIcon" class="h-4 w-4" aria-hidden="true" />
              </span>
              <div class="min-w-0">
                <p class="text-[10px] font-medium text-fg-muted">{{ l('登录方式', 'Sign-in method') }}</p>
                <p class="mt-0.5 truncate text-[12px] font-medium text-fg-secondary">{{ methodText }}</p>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 sm:justify-end">
              <button
                type="button"
                class="flex min-h-10 cursor-pointer items-center gap-2 rounded-md bg-surface pl-3.5 pr-3 text-[12px] font-medium text-fg-secondary shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_-1px_rgba(0,0,0,0.08)] transition-[color,background-color,box-shadow,scale] duration-150 ease-out hover:bg-elevated hover:text-fg hover:shadow-[0_0_0_1px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.05)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
                :disabled="working"
                @click="verify"
              >
                <span class="relative h-4 w-4 shrink-0" aria-hidden="true">
                  <Loader2
                    class="absolute inset-0 h-4 w-4 animate-spin transition-[opacity,scale,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
                    :class="checking ? 'scale-100 opacity-100 blur-0' : 'scale-[0.25] opacity-0 blur-xs'"
                  />
                  <RefreshCw
                    class="absolute inset-0 h-4 w-4 transition-[opacity,scale,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
                    :class="checking ? 'scale-[0.25] opacity-0 blur-xs' : 'scale-100 opacity-100 blur-0'"
                  />
                </span>
                {{ checking ? l('检查中', 'Checking') : l('检查状态', 'Check status') }}
              </button>
              <button
                type="button"
                class="flex min-h-10 cursor-pointer items-center gap-2 rounded-md bg-surface pl-3.5 pr-3 text-[12px] font-medium text-danger shadow-[0_0_0_1px_rgba(245,34,45,0.18),0_1px_2px_-1px_rgba(245,34,45,0.10)] transition-[background-color,box-shadow,opacity,scale] duration-150 ease-out hover:bg-danger/10 hover:shadow-[0_0_0_1px_rgba(245,34,45,0.30),0_2px_4px_rgba(245,34,45,0.08)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/30 disabled:cursor-wait disabled:opacity-50 disabled:active:scale-100"
                :disabled="working"
                @click="logoutDialogOpen = true"
              >
                <LogOut class="h-4 w-4" aria-hidden="true" />
                {{ l('退出登录', 'Sign out') }}
              </button>
            </div>
          </div>
        </div>

        <div
          v-else-if="checking"
          key="checking"
          class="account-surface flex min-h-29 items-center gap-4 rounded-xl px-5 py-5"
          aria-live="polite"
          aria-atomic="true"
        >
          <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Loader2 class="h-6 w-6 animate-spin" aria-hidden="true" />
          </span>
          <div class="min-w-0">
            <p class="text-[14px] font-semibold text-fg">{{ l('正在检查登录状态', 'Checking sign-in status') }}</p>
            <p class="mt-1 text-pretty text-[11px] leading-relaxed text-fg-muted">
              {{ l('正在确认本机是否保存了可用的完美平台登录', 'Checking this device for a valid Perfect World session.') }}
            </p>
          </div>
        </div>

        <div v-else key="signed-out" class="space-y-5">
          <div class="account-surface flex items-center gap-4 rounded-xl px-4 py-4 sm:px-5">
            <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface text-fg-muted shadow-[0_0_0_1px_rgba(0,0,0,0.06)]">
              <CircleUserRound class="h-6 w-6" aria-hidden="true" />
            </span>
            <div class="min-w-0">
              <p class="text-[14px] font-semibold text-fg">{{ l('尚未登录', 'Not signed in') }}</p>
              <p class="mt-1 text-pretty text-[11px] leading-relaxed text-fg-muted">
                {{ l('任选一种方式登录后，即可查询完美平台战绩', 'Choose either method to access Perfect World match data.') }}
              </p>
            </div>
          </div>

          <section aria-labelledby="perfect-login-methods-title">
            <div class="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h4 id="perfect-login-methods-title" class="text-balance text-[13px] font-semibold text-fg">
                  {{ l('选择登录方式', 'Choose a sign-in method') }}
                </h4>
                <p class="mt-1 text-pretty text-[11px] text-fg-muted">
                  {{ l('两种方式权限相同，完美电竞 App 扫码更快捷', 'Both methods provide the same access. The Perfect Esports app is faster.') }}
                </p>
              </div>
            </div>

            <div class="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                class="group flex min-h-19 cursor-pointer items-center gap-3 rounded-lg bg-accent pl-4 pr-3.5 text-left text-white shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_12px_rgba(74,144,226,0.12)] transition-[background-color,box-shadow,scale] duration-200 ease-out hover:bg-accent-hover hover:shadow-[0_2px_4px_rgba(0,0,0,0.08),0_6px_16px_rgba(74,144,226,0.18)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50 disabled:active:scale-100"
                :disabled="working"
                @click="openLogin('qr')"
              >
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/14">
                  <QrCode class="h-5 w-5" aria-hidden="true" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block text-[12px] font-semibold">{{ l('完美电竞 App', 'Perfect Esports app') }}</span>
                  <span class="mt-0.5 block text-[10px] text-white/75">{{ l('扫码登录 · 推荐', 'QR sign-in · Recommended') }}</span>
                </span>
                <ChevronRight class="h-4 w-4 shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="group flex min-h-19 cursor-pointer items-center gap-3 rounded-lg bg-surface pl-4 pr-3.5 text-left text-fg-secondary shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_-1px_rgba(0,0,0,0.06)] transition-[color,background-color,box-shadow,scale] duration-200 ease-out hover:bg-elevated hover:text-fg hover:shadow-[0_0_0_1px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-wait disabled:opacity-50 disabled:active:scale-100"
                :disabled="working"
                @click="openLogin('steam')"
              >
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
                  <Globe2 class="h-5 w-5" aria-hidden="true" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block text-[12px] font-semibold">{{ l('Steam 网页登录', 'Steam web sign-in') }}</span>
                  <span class="mt-0.5 block text-[10px] text-fg-muted">{{ l('独立窗口登录 · 备选', 'Separate window · Alternative') }}</span>
                </span>
                <ChevronRight class="h-4 w-4 shrink-0 text-fg-muted transition-transform duration-200 ease-out group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            </div>
          </section>
        </div>
      </Transition>

      <Transition name="notice">
        <p
          v-if="displayError"
          class="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2.5 text-[11px] leading-relaxed text-fg-secondary shadow-[0_0_0_1px_rgba(245,158,11,0.18)]"
          role="alert"
        >
          <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span>{{ displayError }}</span>
        </p>
      </Transition>
    </SettingsCard>

    <LogoutConfirmDialog
      :open="logoutDialogOpen"
      :busy="action === 'logout'"
      @cancel="logoutDialogOpen = false"
      @confirm="logout"
    />
  </div>
</template>

<style scoped>
.account-surface {
  background: color-mix(in srgb, var(--color-elevated) 72%, var(--color-surface));
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.055),
    0 1px 2px -1px rgba(0, 0, 0, 0.06),
    0 2px 4px rgba(0, 0, 0, 0.025);
}

.auth-panel-enter-active {
  transition:
    opacity 220ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.auth-panel-leave-active {
  transition:
    opacity 120ms ease-in,
    transform 120ms ease-in;
}

.auth-panel-enter-from {
  opacity: 0;
  transform: translate3d(0, 8px, 0);
}

.auth-panel-leave-to {
  opacity: 0;
  transform: translate3d(0, -4px, 0);
}

.notice-enter-active,
.notice-leave-active {
  transition:
    opacity 180ms ease-out,
    transform 180ms ease-out;
}

.notice-enter-from,
.notice-leave-to {
  opacity: 0;
  transform: translate3d(0, -4px, 0);
}
</style>
