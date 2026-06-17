<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { animate } from 'animejs';
import { AlertTriangle, ArrowLeft, Info, Loader2, Play } from 'lucide-vue-next';
import { getPlatformLogo } from '../utils/platform-logos';
import type { useP5eCdp } from '../composables/useP5eCdp';
import { probe5eEnvironment } from '@core/platform/5e';

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

const canLaunch = computed(
  () => installChecked.value && installed.value && !externalRunning.value && !launching.value,
);

const PROBE_INTERVAL_MS = 3000;

let alive = false;
let probing = false;
let probeTimer: ReturnType<typeof setInterval> | null = null;

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
  if (!installed.value) return '请先安装 5E 对战平台';
  if (externalRunning.value) return '请先完全退出 5E';
  if (launching.value) return '正在启动 5E…';
  const phase = props.p5e.status.value.phase;
  if (phase === 'collecting' || phase === 'reconnecting') return '已连接，等待对局';
  if (phase === 'error') return props.p5e.status.value.lastError ?? '连接出现问题';
  return '点击下方按钮启动';
});

async function checkExternal() {
  if (!alive || probing || launching.value) return;

  probing = true;
  try {
    const probe = await probe5eEnvironment();
    if (!alive) return;

    installChecked.value = true;
    installed.value = probe.installed;

    const wasExternal = externalRunning.value;
    externalRunning.value = probe.installed && probe.externalRunning;

    if (probe.externalRunning || !probe.installed) {
      launchError.value = null;
    } else if (wasExternal) {
      launchError.value = null;
    }
  } catch {
    if (!alive) return;
    installChecked.value = true;
    installed.value = false;
    externalRunning.value = false;
  } finally {
    probing = false;
  }
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

function goBack() {
  teardownProbe();
  emit('back');
}

async function launch() {
  if (!canLaunch.value) return;

  stopProbeLoop();
  launching.value = true;
  launchError.value = null;
  let succeeded = false;

  try {
    await props.p5e.launchAndCollect();
    if (!alive) return;
    succeeded = true;
    teardownProbe();
    emit('ready');
  } catch (err) {
    if (!alive) return;
    const message = String(err);
    if (message.includes('EXTERNAL_5E_RUNNING')) {
      externalRunning.value = true;
      launchError.value = null;
    } else if (message.includes('NOT_INSTALLED_5E') || message.includes('未找到 5E') || message.includes('5E 目录无效')) {
      installed.value = false;
      installChecked.value = true;
      launchError.value = null;
    } else {
      launchError.value = message.replace(/^Error:\s*/, '');
    }
  } finally {
    if (alive && !succeeded) {
      launching.value = false;
      startProbeLoop();
    }
  }
}

onMounted(() => {
  alive = true;
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
    <!-- Ambient Background -->
    <div class="pointer-events-none absolute inset-0 bg-base" aria-hidden="true">
      <div class="absolute left-1/2 top-1/2 h-[50vw] w-[50vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent opacity-[0.06] blur-[100px]"></div>
    </div>

    <!-- Top Navigation (Absolute Top Left) -->
    <div class="absolute left-6 top-6 z-20 sm:left-10 sm:top-10">
      <button
        type="button"
        class="group flex cursor-pointer items-center gap-1.5 rounded-full bg-surface/50 px-4 py-2.5 text-[13px] font-medium text-fg-secondary backdrop-blur-md transition-all hover:bg-elevated hover:text-fg shadow-sm"
        :disabled="launching"
        @click="goBack"
      >
        <ArrowLeft class="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
        更换平台
      </button>
    </div>

    <div class="p5e-launch__panel relative z-10 mt-6 w-full max-w-96 rounded-4xl border border-border/40 bg-surface/60 p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] backdrop-blur-xl">
      
      <div class="flex flex-col items-center text-center">
        <!-- Enlarged Logo without rings -->
        <div class="relative flex h-24 w-24 items-center justify-center">
          <img
            :src="getPlatformLogo('5e').src"
            :alt="getPlatformLogo('5e').alt"
            class="h-20 w-20 object-contain drop-shadow-md"
            draggable="false"
          />
        </div>

        <h1 class="mt-4 text-[1.375rem] font-bold tracking-tight text-fg">启动 5E 对战平台</h1>
        <p class="mt-2 max-w-56 text-[13px] leading-relaxed text-fg-muted">
          {{ statusText }}
        </p>

        <!-- Not Installed Alert -->
        <div
          v-if="installChecked && !installed"
          class="mt-8 flex w-full items-start gap-2.5 rounded-xl border border-border bg-elevated px-4 py-3.5 text-left"
          role="alert"
        >
          <Info class="mt-0.5 h-4 w-4 shrink-0 text-fg-secondary" aria-hidden="true" />
          <div class="min-w-0">
            <p class="text-[13px] font-semibold text-fg">未检测到 5E</p>
            <p class="mt-1 text-xs leading-relaxed text-fg-secondary">
              请先安装 5E 对战平台后再试。
            </p>
          </div>
        </div>

        <!-- Running Conflict Alert -->
        <div
          v-else-if="externalRunning"
          class="mt-8 flex w-full items-start gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3.5 text-left"
          role="alert"
        >
          <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
          <div class="min-w-0">
            <p class="text-[13px] font-semibold text-amber-900">检测到 5E 正在运行</p>
            <p class="mt-1 text-xs leading-relaxed text-amber-900/85">
              请<strong class="font-semibold text-amber-800">完全退出</strong> 5E 后，再通过本软件启动。
            </p>
          </div>
        </div>

        <!-- Error Alert -->
        <p v-if="launchError && installed && !externalRunning" class="mt-5 w-full rounded-xl border border-danger/20 bg-danger/10 px-4 py-2.5 text-xs leading-relaxed text-danger" role="alert">
          {{ launchError }}
        </p>

        <!-- Main CTA Button -->
        <button
          type="button"
          class="group relative mt-8 flex w-full cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-2xl px-5 py-3.5 text-[14px] font-bold tracking-wide transition-all duration-300"
          :class="
            canLaunch
              ? 'bg-accent text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent/25 active:translate-y-0'
              : 'cursor-not-allowed bg-surface border border-border/60 text-fg-muted shadow-none'
          "
          :disabled="!canLaunch"
          @click="launch"
        >
          <!-- Inner Glow -->
          <div v-if="canLaunch" class="absolute inset-0 bg-linear-to-t from-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
          
          <Loader2 v-if="launching" class="relative z-10 h-4 w-4 animate-spin text-fg-muted" aria-hidden="true" />
          <Play v-else class="relative z-10 h-4 w-4 fill-current" :class="canLaunch ? 'text-white' : 'text-border'" aria-hidden="true" />
          <span class="relative z-10" :class="canLaunch ? 'text-white' : 'text-fg-muted'">{{ launching ? '正在唤起客户端…' : '立即启动 5E' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media (prefers-reduced-motion: reduce) {
  .animate-\[spin_4s_linear_infinite\],
  .animate-\[spin_3s_linear_infinite_reverse\] {
    animation: none !important;
  }
}
</style>