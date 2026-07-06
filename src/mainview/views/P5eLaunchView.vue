<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { animate } from 'animejs';
import {
  AlertTriangle,
  ArrowLeft,
  FolderOpen,
  Info,
  Loader2,
  Play,
} from 'lucide-vue-next';
import { open } from '@tauri-apps/plugin-dialog';
import { getPlatformLogo } from '../utils/platform-logos';
import type { useP5eCdp } from '../composables/useP5eCdp';
import { probe5eEnvironment } from '@core/platform/5e';
import { loadP5eClientRoot, saveP5eClientRoot } from '@platforms/5e/client-root-storage';
import {
  getP5eSimulatedProbeResult,
  p5eSimulateClientNotFound,
} from '@platforms/5e/p5e-dev-overrides';

const props = defineProps<{
  p5e: ReturnType<typeof useP5eCdp>;
}>();

const emit = defineEmits<{
  ready: [];
  back: [];
}>();

const containerRef = ref<HTMLElement | null>(null);
const installChecked = ref(false);
const installed = ref(false);
const externalRunning = ref(false);
const launching = ref(false);
const launchError = ref<string | null>(null);
const pathError = ref<string | null>(null);
const browsing = ref(false);
const validating = ref(false);

const pathInput = ref('');
const persistedClientRoot = ref<string | null>(null);
const pathValid = ref(false);

const pathDirty = computed(() => pathInput.value.trim() !== (persistedClientRoot.value ?? ''));

const canLaunch = computed(
  () =>
    installChecked.value &&
    installed.value &&
    pathValid.value &&
    !launching.value &&
    !validating.value,
);

const PROBE_INTERVAL_MS = 3000;

let alive = false;
let probing = false;
let probeTimer: ReturnType<typeof setInterval> | null = null;
let pathInputTouched = false;

function activeClientRootHint(): string | undefined {
  return pathInput.value.trim() || undefined;
}

async function probeEnvironment(clientRoot?: string) {
  const simulated = getP5eSimulatedProbeResult();
  if (simulated) return simulated;
  return probe5eEnvironment({ clientRoot });
}

async function persistValidatedPath(root: string) {
  await saveP5eClientRoot(root);
  persistedClientRoot.value = root;
  pathInputTouched = false;
}

function onVisibilityChange() {
  if (!alive) return;
  if (document.visibilityState === 'hidden') {
    stopProbeLoop();
  } else {
    void checkExternal();
    startProbeLoop();
  }
}

const statusText = computed(() => {
  if (!installChecked.value) return '正在检查环境…';
  if (!installed.value) return '请填写或选择 5E 客户端路径';
  if (launching.value) {
    return externalRunning.value ? '正在结束已运行的 5E 并重新启动…' : '正在启动 5E…';
  }
  if (externalRunning.value) return '检测到 5E 正在运行，点击启动将自动结束并重新启动';
  const phase = props.p5e.status.value.phase;
  if (phase === 'collecting' || phase === 'reconnecting') return '已连接，等待对局';
  if (phase === 'error') return props.p5e.status.value.lastError ?? '连接出现问题';
  return '点击下方按钮启动';
});

function applyProbeResult(
  probe: Awaited<ReturnType<typeof probeEnvironment>>,
  options?: { fillPath?: boolean },
) {
  installChecked.value = true;
  installed.value = probe.installed;
  pathValid.value = probe.installed;

  const wasExternal = externalRunning.value;
  externalRunning.value = probe.installed && probe.externalRunning;

  if (options?.fillPath && probe.clientRoot && probe.installed) {
    pathInput.value = probe.clientRoot;
    if (!pathInputTouched) {
      void persistValidatedPath(probe.clientRoot);
    }
  }

  if (probe.externalRunning || !probe.installed) {
    launchError.value = null;
  } else if (wasExternal) {
    launchError.value = null;
  }
}

async function validatePath(options?: { fillPath?: boolean }) {
  const trimmed = pathInput.value.trim();
  if (!trimmed) {
    pathValid.value = false;
    installed.value = false;
    await saveP5eClientRoot(null);
    persistedClientRoot.value = null;
    pathError.value = '请输入 5E 客户端路径';
    return false;
  }

  pathError.value = null;
  validating.value = true;
  stopProbeLoop();

  try {
    const probe = await probeEnvironment(trimmed);
    if (!alive) return false;

    applyProbeResult(probe, { fillPath: options?.fillPath ?? true });

    if (!probe.installed || !probe.clientRoot) {
      pathError.value = '路径无效，请指向包含 5EClient.exe 的目录';
      return false;
    }

    pathInput.value = probe.clientRoot;
    await persistValidatedPath(probe.clientRoot);
    return true;
  } catch (err) {
    pathError.value = String(err).replace(/^Error:\s*/, '');
    pathValid.value = false;
    installed.value = false;
    return false;
  } finally {
    validating.value = false;
    if (alive) startProbeLoop();
  }
}

async function checkExternal() {
  if (!alive || probing || launching.value || browsing.value || validating.value) return;
  if (pathInputTouched && pathDirty.value) return;

  probing = true;
  try {
    const probe = await probeEnvironment(activeClientRootHint());
    if (!alive) return;
    applyProbeResult(probe, { fillPath: !pathInput.value.trim() });
  } catch {
    if (!alive) return;
    installChecked.value = true;
    installed.value = false;
    externalRunning.value = false;
    pathValid.value = false;
  } finally {
    probing = false;
  }
}

async function browseClientPath() {
  if (launching.value || browsing.value || validating.value) return;

  pathError.value = null;
  browsing.value = true;
  stopProbeLoop();

  try {
    const selected = await open({
      multiple: false,
      directory: false,
      title: '选择 5EClient.exe',
      filters: [{ name: '5E 客户端', extensions: ['exe'] }],
    });

    if (!selected || Array.isArray(selected)) return;

    pathInput.value = selected;
    pathInputTouched = true;
    await validatePath({ fillPath: true });
  } catch (err) {
    pathError.value = String(err).replace(/^Error:\s*/, '');
  } finally {
    browsing.value = false;
    if (alive) startProbeLoop();
  }
}

function onPathInput() {
  pathInputTouched = true;
  if (pathDirty.value) {
    pathValid.value = false;
    installed.value = false;
  }
}

function onPathKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    void validatePath();
  }
}

function onPathBlur() {
  if (!pathInputTouched || !pathInput.value.trim()) return;
  void validatePath();
}

function startProbeLoop() {
  if (!alive) return;
  stopProbeLoop();
  probeTimer = window.setInterval(() => {
    void checkExternal();
  }, PROBE_INTERVAL_MS);
}

function stopProbeLoop() {
  if (probeTimer !== null) {
    window.clearInterval(probeTimer);
    probeTimer = null;
  }
}

function teardownProbe() {
  alive = false;
  stopProbeLoop();
  document.removeEventListener('visibilitychange', onVisibilityChange);
}

function formatLaunchError(message: string): string {
  return message
    .replace(/^Error:\s*/, '')
    .replace(/^TERMINATE_5E_FAILED:\s*/, '');
}

function goBack() {
  teardownProbe();
  emit('back');
}

async function launch() {
  if (!canLaunch.value) return;

  if (pathDirty.value || !pathValid.value) {
    const ok = await validatePath();
    if (!ok) return;
  }

  stopProbeLoop();
  launching.value = true;
  launchError.value = null;
  let succeeded = false;

  try {
    await props.p5e.launchAndCollect({
      clientRoot: pathInput.value.trim() || undefined,
    });
    if (!alive) return;
    succeeded = true;
    teardownProbe();
    emit('ready');
  } catch (err) {
    if (!alive) return;
    const message = String(err);
    if (message.includes('TERMINATE_5E_FAILED')) {
      externalRunning.value = true;
      launchError.value = formatLaunchError(message);
    } else if (message.includes('EXTERNAL_5E_RUNNING')) {
      externalRunning.value = true;
      launchError.value = '检测到外部 5E 调试连接，请手动完全退出 5E 后重试';
    } else if (
      message.includes('NOT_INSTALLED_5E') ||
      message.includes('未找到 5E') ||
      message.includes('5E 目录无效')
    ) {
      installed.value = false;
      pathValid.value = false;
      installChecked.value = true;
      launchError.value = null;
    } else {
      launchError.value = formatLaunchError(message);
    }
  } finally {
    if (alive && !succeeded) {
      launching.value = false;
      startProbeLoop();
    }
  }
}

watch(p5eSimulateClientNotFound, () => {
  if (!alive) return;
  void checkExternal();
});

watch(pathInput, () => {
  if (!pathInputTouched) return;
  pathError.value = null;
});

onMounted(async () => {
  alive = true;

  const saved = await loadP5eClientRoot();
  persistedClientRoot.value = saved;
  pathInput.value = saved ?? '';

  const root = containerRef.value;
  if (root) {
    const panel = root.querySelector('.p5e-launch__panel');
    if (panel) {
      (panel as HTMLElement).style.opacity = '0';
      (panel as HTMLElement).style.transform = 'translateY(16px)';
      animate(panel, {
        opacity: [0, 1],
        translateY: [16, 0],
        duration: 800,
        ease: 'outExpo',
      });
    }
  }

  void checkExternal();
  startProbeLoop();
  document.addEventListener('visibilitychange', onVisibilityChange);
});

onBeforeUnmount(() => {
  teardownProbe();
});
</script>

<template>
  <div ref="containerRef" class="relative flex min-h-full flex-col items-center justify-center overflow-hidden p-6 sm:p-12">
    <div class="pointer-events-none absolute inset-0 bg-base" aria-hidden="true">
      <div class="absolute left-1/2 top-1/2 h-[50vw] w-[50vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent opacity-[0.06] blur-[100px]"></div>
    </div>

    <div class="absolute left-6 top-6 z-20 sm:left-10 sm:top-10">
      <button
        type="button"
        class="group flex cursor-pointer items-center gap-1.5 rounded-full bg-surface/50 px-4 py-2.5 text-[13px] font-medium text-fg-secondary backdrop-blur-md transition-colors duration-200 hover:bg-elevated hover:text-fg shadow-sm"
        :disabled="launching"
        @click="goBack"
      >
        <ArrowLeft class="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
        更换平台
      </button>
    </div>

    <div class="p5e-launch__panel relative z-10 mt-6 w-full max-w-md rounded-4xl border border-border/40 bg-surface/60 p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] backdrop-blur-xl">
      <div class="flex flex-col items-center text-center">
        <div class="relative flex h-24 w-24 items-center justify-center">
          <img
            :src="getPlatformLogo('5e').src"
            :alt="getPlatformLogo('5e').alt"
            class="h-20 w-20 object-contain drop-shadow-md"
            draggable="false"
          />
        </div>

        <h1 class="mt-4 text-[1.375rem] font-bold tracking-tight text-fg">启动 5E 对战平台</h1>
        <p class="mt-2 max-w-xs text-[13px] leading-relaxed text-fg-muted">
          {{ statusText }}
        </p>

        <!-- Compact path field -->
        <div v-if="installChecked" class="mt-5 w-full text-left">
          <div class="flex items-center gap-1.5">
            <span
              class="inline-flex h-1.5 w-1.5 shrink-0 rounded-full"
              :class="pathValid ? 'bg-success' : 'bg-danger'"
              :title="pathValid ? '路径有效' : '未找到客户端'"
              aria-hidden="true"
            />
            <label for="p5e-client-path" class="text-[11px] font-medium tracking-wide text-fg-secondary">
              客户端路径
            </label>
          </div>

          <div class="mt-1.5 flex gap-1.5">
            <input
              id="p5e-client-path"
              v-model="pathInput"
              type="text"
              spellcheck="false"
              autocomplete="off"
              placeholder="包含 5EClient.exe 的目录路径"
              class="selectable min-w-0 flex-1 rounded-lg border bg-surface px-2.5 py-1.5 font-mono text-[11px] text-fg outline-none transition-colors duration-200 placeholder:text-fg-muted focus:ring-2"
              :class="
                pathError
                  ? 'border-danger/50 focus:border-danger focus:ring-danger/15'
                  : pathValid
                    ? 'border-success/40 focus:border-success focus:ring-success/15'
                    : 'border-border focus:border-accent focus:ring-accent/15'
              "
              :disabled="launching || browsing || validating"
              @input="onPathInput"
              @keydown="onPathKeydown"
              @blur="onPathBlur"
            />
            <button
              type="button"
              class="flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
              title="浏览文件"
              :disabled="launching || browsing || validating"
              @click="browseClientPath"
            >
              <Loader2 v-if="browsing" class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              <FolderOpen v-else class="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <p
            v-if="!installed && !pathError"
            class="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-fg-muted"
          >
            <Info class="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
            支持手动输入或粘贴路径，验证通过后自动保存
          </p>

          <p
            v-if="externalRunning && !launchError"
            class="mt-2 flex items-start gap-1.5 rounded-lg border border-border bg-elevated px-2.5 py-2 text-[11px] leading-relaxed text-fg-secondary"
            role="status"
          >
            <Info class="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
            5E 正在运行。点击「立即启动」将尝试自动结束进程；若失败请按下方提示手动退出。
          </p>
        </div>

        <p
          v-if="pathError"
          class="mt-3 w-full rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-left text-[11px] leading-relaxed text-danger"
          role="alert"
        >
          {{ pathError }}
        </p>

        <p
          v-if="launchError && installed"
          class="mt-3 w-full rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-[11px] leading-relaxed text-danger"
          role="alert"
        >
          <span class="flex items-start gap-1.5">
            <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{{ launchError }}</span>
          </span>
        </p>

        <button
          type="button"
          class="group relative mt-7 flex w-full cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-2xl px-5 py-3.5 text-[14px] font-bold tracking-wide transition-all duration-300"
          :class="
            canLaunch
              ? 'bg-accent text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent/25 active:translate-y-0'
              : 'cursor-not-allowed border border-border/60 bg-surface text-fg-muted shadow-none'
          "
          :disabled="!canLaunch"
          @click="launch"
        >
          <div v-if="canLaunch" class="absolute inset-0 bg-linear-to-t from-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>

          <Loader2 v-if="launching" class="relative z-10 h-4 w-4 animate-spin text-fg-muted" aria-hidden="true" />
          <Play v-else class="relative z-10 h-4 w-4 fill-current" :class="canLaunch ? 'text-white' : 'text-border'" aria-hidden="true" />
          <span class="relative z-10" :class="canLaunch ? 'text-white' : 'text-fg-muted'">{{ launching ? '正在唤起客户端…' : '立即启动 5E' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
