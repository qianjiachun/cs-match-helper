<script setup lang="ts">
import type { DebugLogEntry } from '@core/log/types';
import type { WatcherStatus } from '@core/types';
import { Bug, ChevronDown, Code2, MessageSquare, ScrollText, X } from 'lucide-vue-next';
import { computed, nextTick, ref, watch } from 'vue';
import { getActivePlatform } from '@platforms/registry';
import {
  p5eSimulateClientNotFound,
  toggleP5eSimulateClientNotFound,
} from '@platforms/5e/p5e-dev-overrides';
import type { useP5eCdp } from '../composables/useP5eCdp';
import type { useComments } from '../composables/useComments';
import { formatAppVersion, useUpdateCheck } from '../composables/useUpdateCheck';
import { closeAppDevtools, openAppDevtools } from '../utils/devtools';
import {
  collectRuntimeDiagnostics,
  formatRuntimeDiagnostics,
} from '../utils/runtime-diagnostics';
const props = withDefaults(
  defineProps<{
    placement?: 'header' | 'floating' | 'inline';
    logEntries?: DebugLogEntry[];
    watcher?: WatcherStatus;
    injectAiResult?: (raw: string) => Promise<string | null>;
    p5e?: ReturnType<typeof useP5eCdp>;
    comments?: ReturnType<typeof useComments>;
  }>(),
  {
    placement: 'inline',
    logEntries: () => [],
    watcher: () => ({
      running: false,
      logPath: '',
      fileExists: false,
      fileSize: 0,
      linesReceived: 0,
    }),
    injectAiResult: undefined,
  },
);

const emit = defineEmits<{
  inject: [data: Record<string, unknown>];
  injectAi: [raw: string];
  clearLogs: [];
}>();

type DebugTab = 'inject' | 'logs';
type InjectSubTab = 'match' | 'p5e' | 'ai' | 'update' | 'comments' | 'runtime';
type LogSubTab = 'perfect' | 'p5e';

const isDev = import.meta.env.DEV;

const runtimeDiagnosticsText = formatRuntimeDiagnostics(collectRuntimeDiagnostics());

const {
  state: updateState,
  formattedVersion,
  simulateUpdate,
  clearUpdateHint,
  openDialog: openUpdateDialog,
} = useUpdateCheck();

const open = ref(false);
const activeTab = ref<DebugTab>('inject');
const injectSubTab = ref<InjectSubTab>('match');
const logSubTab = ref<LogSubTab>('perfect');
const input = ref('');
const aiInput = ref('');
const error = ref('');
const aiError = ref('');
const autoScroll = ref(true);
const logListRef = ref<HTMLElement | null>(null);
const expandedIds = ref<Set<string>>(new Set());

const p5eNdjsonInput = ref('');
const p5eError = ref('');
const devtoolsError = ref('');

const p5eLogEntries = computed(() => props.p5e?.logEntries.value ?? []);
const activeLogEntries = computed(() =>
  logSubTab.value === 'p5e' ? p5eLogEntries.value : props.logEntries,
);
const totalLogCount = computed(
  () => props.logEntries.length + (props.p5e?.logEntries.value.length ?? 0),
);

const p5ePhaseLabel: Record<string, string> = {
  idle: '空闲',
  launching: '启动中',
  cdpReady: '已连接',
  collecting: '采集中',
  reconnecting: '重连中',
  stopped: '已停止',
  error: '错误',
};

async function openDevtoolsPanel() {
  devtoolsError.value = '';
  try {
    await openAppDevtools();
  } catch (err) {
    devtoolsError.value = String(err);
  }
}

async function closeDevtoolsPanel() {
  devtoolsError.value = '';
  try {
    await closeAppDevtools();
  } catch (err) {
    devtoolsError.value = String(err);
  }
}

function toggleClientNotFoundSim() {
  p5eError.value = '';
  toggleP5eSimulateClientNotFound();
}

async function simulateP5eMatch() {
  p5eError.value = '';
  if (!props.p5e) {
    p5eError.value = '5E 模块未就绪';
    return;
  }
  const record = await props.p5e.simulateFixture();
  if (!record) p5eError.value = props.p5e.lastError.value ?? '模拟失败';
  else if (props.placement === 'header') open.value = false;
}

function replayP5eNdjson() {
  p5eError.value = '';
  if (!props.p5e) {
    p5eError.value = '5E 模块未就绪';
    return;
  }
  const bundles = props.p5e.replayNdjson(p5eNdjsonInput.value);
  if (!bundles.length) {
    p5eError.value = '未解析到有效 5e 匹配事件';
    return;
  }
  p5eNdjsonInput.value = '';
  if (props.placement === 'header') open.value = false;
}

function submit() {
  error.value = '';
  const result = getActivePlatform().parseMatchInput(input.value);
  if ('error' in result) {
    error.value = result.error;
    return;
  }
  emit('inject', result.data);
  input.value = '';
  if (props.placement === 'header') {
    open.value = false;
  }
}

async function submitAi() {
  aiError.value = '';
  const raw = aiInput.value.trim();
  if (!raw) {
    aiError.value = '请粘贴 AI 分析 JSON';
    return;
  }
  const inject = props.injectAiResult;
  if (inject) {
    const err = await inject(raw);
    if (err) {
      aiError.value = err;
      return;
    }
  } else {
    emit('injectAi', raw);
  }
  aiInput.value = '';
  if (props.placement === 'header') {
    open.value = false;
  }
}

function openMockComments(scenario: 'list' | 'empty' | 'loading' | 'error' = 'list') {
  props.comments?.openMockDrawer(scenario);
  if (props.placement === 'header') open.value = false;
}

function fillMockHistory() {
  props.comments?.fillMockHistory();
}

function switchInjectSubTab(tab: InjectSubTab) {
  injectSubTab.value = tab;
  error.value = '';
  aiError.value = '';
}

function close() {
  open.value = false;
}

function toggle() {
  open.value = !open.value;
}

function switchTab(tab: DebugTab) {
  activeTab.value = tab;
}

function toggleExpand(id: string) {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
}

function clearLogs() {
  if (logSubTab.value === 'p5e') {
    props.p5e?.clearLogEntries();
  } else {
    emit('clearLogs');
  }
  expandedIds.value = new Set();
}

function truncate(text: string, max = 160) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function levelClass(level?: string) {
  switch (level?.toUpperCase()) {
    case 'ERROR':
      return 'text-danger';
    case 'WARN':
    case 'WARNING':
      return 'text-warning';
    case 'INFO':
      return 'text-accent';
    default:
      return 'text-fg-muted';
  }
}

watch(
  () => [props.logEntries.length, p5eLogEntries.value.length] as const,
  async () => {
    if (!autoScroll.value || activeTab.value !== 'logs') return;
    await nextTick();
    const el = logListRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  },
);
</script>

<template>
  <!-- 顶部标题栏入口 -->
  <template v-if="placement === 'header'">
    <button
      type="button"
      class="flex h-full cursor-pointer items-center gap-1 px-3 text-[12px] text-fg-muted transition-colors duration-200 hover:bg-elevated hover:text-fg-secondary"
      :class="open ? 'bg-elevated text-fg-secondary' : ''"
      title="调试：注入数据与日志输出"
      @click="toggle"
    >
      <Bug class="h-4 w-4" />
      <span class="hidden sm:inline">调试</span>
    </button>

    <div
      v-if="open"
      class="absolute right-28 top-full z-50 mt-0 w-[min(560px,calc(100vw-2rem))] overflow-hidden rounded-b-xl border border-t-0 border-border bg-surface shadow-xl"
    >
      <div class="flex items-center justify-between border-b border-border bg-elevated px-4 py-2.5">
        <span class="flex items-center gap-2 text-[12px] font-medium text-fg-secondary">
          <Bug class="h-3.5 w-3.5 text-fg-muted" />
          调试面板
        </span>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-base hover:text-fg-secondary"
            title="打开 WebView 开发者工具（F12 / Ctrl+Shift+I）"
            @click="openDevtoolsPanel"
          >
            <Code2 class="h-3.5 w-3.5" />
            DevTools
          </button>
          <button
            type="button"
            class="cursor-pointer rounded p-1 text-fg-muted transition-colors hover:bg-base hover:text-fg-secondary"
            aria-label="关闭"
            @click="close"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div class="flex border-b border-border bg-base px-2">
        <button
          type="button"
          class="cursor-pointer border-b-2 px-3 py-2 text-[11px] font-medium transition-colors"
          :class="
            activeTab === 'inject'
              ? 'border-accent text-fg'
              : 'border-transparent text-fg-muted hover:text-fg-secondary'
          "
          @click="switchTab('inject')"
        >
          注入数据
        </button>
        <button
          type="button"
          class="flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2 text-[11px] font-medium transition-colors"
          :class="
            activeTab === 'logs'
              ? 'border-accent text-fg'
              : 'border-transparent text-fg-muted hover:text-fg-secondary'
          "
          @click="switchTab('logs')"
        >
          <ScrollText class="h-3.5 w-3.5" />
          日志输出
          <span
            v-if="totalLogCount"
            class="rounded-full bg-elevated px-1.5 py-0.5 text-[10px] text-fg-muted"
          >
            {{ totalLogCount }}
          </span>
        </button>
      </div>

      <!-- 注入 -->
      <div v-if="activeTab === 'inject'" class="p-4">
        <div class="mb-3 flex gap-1 rounded-lg bg-elevated p-0.5">
          <button
            type="button"
            class="flex-1 cursor-pointer rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors"
            :class="
              injectSubTab === 'match'
                ? 'bg-surface text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg-secondary'
            "
            @click="switchInjectSubTab('match')"
          >
            匹配数据
          </button>
          <button
            v-if="isDev"
            type="button"
            class="flex-1 cursor-pointer rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors"
            :class="
              injectSubTab === 'p5e'
                ? 'bg-surface text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg-secondary'
            "
            @click="switchInjectSubTab('p5e')"
          >
            5E 模拟
          </button>
          <button
            type="button"
            class="flex-1 cursor-pointer rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors"
            :class="
              injectSubTab === 'ai'
                ? 'bg-surface text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg-secondary'
            "
            @click="switchInjectSubTab('ai')"
          >
            AI 结果
          </button>
          <button
            type="button"
            class="flex-1 cursor-pointer rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors"
            :class="
              injectSubTab === 'comments'
                ? 'bg-surface text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg-secondary'
            "
            @click="switchInjectSubTab('comments')"
          >
            评论 Mock
          </button>
          <button
            type="button"
            class="flex-1 cursor-pointer rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors"
            :class="
              injectSubTab === 'update'
                ? 'bg-surface text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg-secondary'
            "
            @click="switchInjectSubTab('update')"
          >
            更新模拟
          </button>
          <button
            type="button"
            class="flex-1 cursor-pointer rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors"
            :class="
              injectSubTab === 'runtime'
                ? 'bg-surface text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg-secondary'
            "
            @click="switchInjectSubTab('runtime')"
          >
            运行时
          </button>
        </div>

        <div v-if="injectSubTab === 'match'" class="space-y-3">
          <p class="text-[11px] leading-relaxed text-fg-muted">
            粘贴解码后的匹配 JSON，含 players 与 playerlist_extrainfo。
          </p>
          <textarea
            v-model="input"
            class="h-36 w-full resize-y rounded-md border border-border bg-base px-3 py-2 font-mono text-[11px] leading-relaxed text-fg outline-none transition-colors focus:border-accent"
            placeholder='{"platform_game_id":"...","map_name":"de_dust2","players":[...]}'
            spellcheck="false"
          />
          <div class="flex items-center justify-between gap-3">
            <p v-if="error" class="text-[11px] text-danger">{{ error }}</p>
            <span v-else />
            <button
              type="button"
              class="shrink-0 cursor-pointer rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors duration-200 hover:bg-accent-hover"
              @click="submit"
            >
              注入
            </button>
          </div>
        </div>

        <div v-else-if="isDev && injectSubTab === 'p5e'" class="space-y-3">
          <p class="text-[11px] leading-relaxed text-fg-muted">
            一键模拟 5e 匹配成功，或粘贴 NDJSON 逐行回放（自动过滤 token/curl）。
          </p>
          <div class="rounded-md border border-border bg-elevated px-3 py-2.5">
            <p class="text-[11px] leading-relaxed text-fg-secondary">
              启动页调试：模拟未安装 5E 时，启动页会提示填写路径且无法点击「立即启动」。
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="cursor-pointer rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors duration-200"
                :class="
                  p5eSimulateClientNotFound
                    ? 'border-warning/40 bg-warning/10 text-fg hover:bg-warning/15'
                    : 'border-border bg-surface text-fg-secondary hover:bg-base'
                "
                @click="toggleClientNotFoundSim"
              >
                {{ p5eSimulateClientNotFound ? '关闭「找不到客户端」模拟' : '模拟找不到客户端' }}
              </button>
              <span class="text-[10px] text-fg-muted">
                当前：{{ p5eSimulateClientNotFound ? '已开启' : '未开启' }}
              </span>
            </div>
          </div>
          <button
            type="button"
            class="w-full cursor-pointer rounded-md bg-accent px-3 py-2 text-[12px] font-medium text-white transition-colors hover:bg-accent-hover"
            @click="simulateP5eMatch"
          >
            模拟 5e 匹配成功
          </button>
          <textarea
            v-model="p5eNdjsonInput"
            class="h-28 w-full resize-y rounded-md border border-border bg-base px-3 py-2 font-mono text-[11px] leading-relaxed text-fg outline-none transition-colors focus:border-accent"
            placeholder="粘贴 5e-match-events.ndjson 内容…"
            spellcheck="false"
          />
          <div class="flex items-center justify-between gap-3">
            <p v-if="p5eError" class="text-[11px] text-danger">{{ p5eError }}</p>
            <span v-else />
            <button
              type="button"
              class="shrink-0 cursor-pointer rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-fg-secondary transition-colors hover:bg-elevated"
              @click="replayP5eNdjson"
            >
              NDJSON 回放
            </button>
          </div>
        </div>

        <div v-else-if="injectSubTab === 'ai'" class="space-y-3">
          <p class="text-[11px] leading-relaxed text-fg-muted">
            粘贴 AI 分析 JSON，直接预览结果面板（需先有当前匹配数据）。
          </p>
          <textarea
            v-model="aiInput"
            class="h-36 w-full resize-y rounded-md border border-border bg-base px-3 py-2 font-mono text-[11px] leading-relaxed text-fg outline-none transition-colors focus:border-accent"
            placeholder='{"predictedWinner":"A","winProbability":{"A":58,"B":42},"headline":"...","playerNotes":[...]}'
            spellcheck="false"
          />
          <div class="flex items-center justify-between gap-3">
            <p v-if="aiError" class="text-[11px] text-danger">{{ aiError }}</p>
            <span v-else />
            <button
              type="button"
              class="shrink-0 cursor-pointer rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors duration-200 hover:bg-accent-hover"
              @click="submitAi"
            >
              注入 AI 结果
            </button>
          </div>
        </div>

        <div v-else-if="injectSubTab === 'comments'" class="space-y-3">
          <p class="text-[11px] leading-relaxed text-fg-muted">
            打开带 Mock 数据的评论抽屉，或填充设置页「我的评论」列表（不请求接口）。
          </p>
          <div class="rounded-md border border-border bg-base px-3 py-2.5 text-[11px] leading-relaxed text-fg-secondary">
            <p>玩家：调试玩家_Mock</p>
            <p class="mt-1">SteamID：76561198000000001</p>
            <p class="mt-1">Mock 列表含 5 条评论（含 1 条自己的评论）</p>
            <p class="mt-1">Mock 历史含 5 条评论（3 个不同 SteamID）</p>
          </div>
          <button
            type="button"
            class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-[12px] font-medium text-white transition-colors duration-200 hover:bg-accent-hover"
            @click="openMockComments('list')"
          >
            <MessageSquare class="h-3.5 w-3.5" aria-hidden="true" />
            打开 Mock 评论抽屉
          </button>
          <button
            type="button"
            class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-[12px] font-medium text-accent transition-colors duration-200 hover:bg-accent/10"
            @click="fillMockHistory"
          >
            <MessageSquare class="h-3.5 w-3.5" aria-hidden="true" />
            填充我的评论
          </button>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
              @click="openMockComments('empty')"
            >
              空状态
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
              @click="openMockComments('loading')"
            >
              加载中
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
              @click="openMockComments('error')"
            >
              错误态
            </button>
          </div>
        </div>

        <div v-else-if="injectSubTab === 'update'" class="space-y-3">
          <p class="text-[11px] leading-relaxed text-fg-muted">
            模拟检测到新版本，用于测试标题栏与关于页的更新提示和弹窗。
          </p>
          <div class="rounded-md border border-border bg-base px-3 py-2.5 text-[11px] leading-relaxed text-fg-secondary">
            <p>当前版本：{{ formattedVersion || '加载中…' }}</p>
            <p class="mt-1">
              模拟状态：
              <span :class="updateState.hasUpdate ? 'text-warning' : 'text-fg-muted'">
                {{ updateState.hasUpdate ? `有新版本 ${formatAppVersion(updateState.latestVersion)}` : '无更新提示' }}
              </span>
            </p>
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              class="cursor-pointer rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
              :disabled="!updateState.hasUpdate"
              @click="clearUpdateHint"
            >
              清除提示
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
              :disabled="!updateState.hasUpdate"
              @click="openUpdateDialog"
            >
              打开弹窗
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors duration-200 hover:bg-accent-hover"
              @click="simulateUpdate"
            >
              模拟检测到新版本
            </button>
          </div>
        </div>

        <div v-else class="space-y-3">
          <p class="text-[11px] leading-relaxed text-fg-muted">
            WebView2 与动画能力诊断，用于排查其他电脑上的界面/动画异常。
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="flex cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors duration-200 hover:bg-accent-hover"
              @click="openDevtoolsPanel"
            >
              <Code2 class="h-3.5 w-3.5" />
              打开开发者工具
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
              @click="closeDevtoolsPanel"
            >
              关闭开发者工具
            </button>
          </div>
          <p class="text-[10px] text-fg-muted">
            快捷键：F12 或 Ctrl+Shift+I<span v-if="!isDev">（需先解锁调试模式）</span>
          </p>
          <p v-if="devtoolsError" class="text-[11px] text-danger">{{ devtoolsError }}</p>
          <pre
            class="selectable max-h-48 overflow-auto rounded-md border border-border bg-base p-3 font-mono text-[10px] leading-relaxed text-fg-secondary whitespace-pre-wrap break-all"
          >{{ runtimeDiagnosticsText }}</pre>
        </div>
      </div>

      <!-- 日志 -->
      <div v-else class="flex flex-col">
        <div v-if="p5e" class="flex border-b border-border bg-base px-2">
          <button
            type="button"
            class="cursor-pointer border-b-2 px-3 py-1.5 text-[10px] font-medium transition-colors"
            :class="
              logSubTab === 'perfect'
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-muted hover:text-fg-secondary'
            "
            @click="logSubTab = 'perfect'"
          >
            完美日志
            <span v-if="logEntries.length" class="ml-1 text-fg-muted">({{ logEntries.length }})</span>
          </button>
          <button
            type="button"
            class="cursor-pointer border-b-2 px-3 py-1.5 text-[10px] font-medium transition-colors"
            :class="
              logSubTab === 'p5e'
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-muted hover:text-fg-secondary'
            "
            @click="logSubTab = 'p5e'"
          >
            5E 数据
            <span v-if="p5eLogEntries.length" class="ml-1 text-fg-muted">({{ p5eLogEntries.length }})</span>
          </button>
        </div>

        <div
          class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2 text-[10px] text-fg-muted"
        >
          <template v-if="logSubTab === 'p5e' && p5e">
            <span :class="p5e.status.value.running ? 'text-success' : 'text-fg-muted'">
              {{ p5e.status.value.running ? '采集中' : '未采集' }}
            </span>
            <span>阶段 {{ p5ePhaseLabel[p5e.status.value.phase] ?? p5e.status.value.phase }}</span>
            <span v-if="p5e.status.value.port">端口 {{ p5e.status.value.port }}</span>
            <span>事件 {{ p5e.status.value.eventsEmitted }}</span>
            <span>展示 {{ p5eLogEntries.length }} 条</span>
            <span v-if="p5e.lastError.value" class="text-danger truncate" :title="p5e.lastError.value">
              错误: {{ p5e.lastError.value }}
            </span>
          </template>
          <template v-else>
            <span :class="watcher.running ? 'text-success' : 'text-fg-muted'">
              {{ watcher.running ? '监听中' : '未监听' }}
            </span>
            <span>已收 {{ watcher.linesReceived }} 行</span>
            <span>展示 {{ logEntries.length }} 条</span>
            <span class="truncate" :title="watcher.logPath">
              {{ watcher.fileExists ? watcher.logPath : '等待日志文件…' }}
            </span>
          </template>
          <div class="ml-auto flex items-center gap-2">
            <label class="flex cursor-pointer items-center gap-1">
              <input v-model="autoScroll" type="checkbox" class="accent-accent" />
              自动滚动
            </label>
            <button
              type="button"
              class="cursor-pointer rounded px-2 py-0.5 text-[10px] text-fg-muted transition-colors hover:bg-elevated hover:text-fg-secondary"
              @click="clearLogs"
            >
              清空
            </button>
          </div>
        </div>

        <div
          ref="logListRef"
          class="selectable max-h-[min(420px,50vh)] overflow-y-auto p-3"
        >
          <p
            v-if="!activeLogEntries.length"
            class="py-8 text-center text-[11px] text-fg-muted"
          >
            <template v-if="logSubTab === 'p5e'">
              暂无 5E 数据。启动 5E 并开始匹配后，采集到的 API 响应会显示在这里。
            </template>
            <template v-else>
              暂无日志。开始监听后，每行 log 的解析结果会显示在这里。
            </template>
          </p>

          <article
            v-for="entry in activeLogEntries"
            :key="entry.id"
            class="mb-2 rounded-md border border-border bg-base p-2.5 last:mb-0"
            :class="entry.isMatchEvent ? 'border-accent/30 bg-accent/5' : ''"
          >
            <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
              <span class="font-mono text-fg-muted">{{ entry.receivedAt }}</span>
              <span v-if="entry.parsed.time" class="font-mono text-fg-muted">
                {{ entry.parsed.time }}
              </span>
              <span v-if="entry.parsed.level" class="font-medium" :class="levelClass(entry.parsed.level)">
                {{ entry.parsed.level }}
              </span>
              <span v-if="entry.parsed.category" class="text-fg-secondary">
                {{ entry.parsed.category }}
              </span>
              <span
                v-if="entry.isMatchEvent"
                class="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-medium text-accent"
              >
                匹配事件
              </span>
            </div>

            <p class="mt-1.5 break-all font-mono text-[10px] leading-relaxed text-fg">
              {{ expandedIds.has(entry.id) ? entry.parsed.decoded : truncate(entry.parsed.decoded) }}
            </p>

            <button
              v-if="entry.parsed.decoded.length > 160 || entry.parsed.raw !== entry.parsed.decoded"
              type="button"
              class="mt-1 cursor-pointer text-[10px] text-accent hover:underline"
              @click="toggleExpand(entry.id)"
            >
              {{ expandedIds.has(entry.id) ? '收起' : '展开详情' }}
            </button>

            <pre
              v-if="expandedIds.has(entry.id)"
              class="mt-2 max-h-32 overflow-auto rounded border border-border bg-surface p-2 font-mono text-[9px] leading-relaxed text-fg-muted whitespace-pre-wrap break-all"
            >raw: {{ entry.parsed.raw }}</pre>
          </article>
        </div>
      </div>
    </div>
  </template>

  <!-- 右下角浮动调试入口 -->
  <template v-else-if="placement === 'floating'">
    <button
      v-if="!open"
      type="button"
      class="absolute bottom-5 right-5 z-20 flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-2 text-[11px] font-medium text-fg-muted shadow-md transition-colors duration-200 hover:border-accent/40 hover:text-fg-secondary"
      title="调试"
      @click="open = true"
    >
      <Bug class="h-3.5 w-3.5" />
      调试
    </button>

    <div
      v-else
      class="absolute bottom-5 right-5 z-20 w-[min(420px,calc(100vw-2.5rem))] overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
    >
      <div class="flex items-center justify-between border-b border-border bg-elevated px-4 py-2.5">
        <span class="flex items-center gap-2 text-[12px] font-medium text-fg-secondary">
          <Bug class="h-3.5 w-3.5 text-fg-muted" />
          注入匹配数据
        </span>
        <button
          type="button"
          class="cursor-pointer rounded p-1 text-fg-muted transition-colors hover:bg-base hover:text-fg-secondary"
          aria-label="关闭"
          @click="close"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="space-y-3 p-4">
        <textarea
          v-model="input"
          class="h-36 w-full resize-y rounded-md border border-border bg-base px-3 py-2 font-mono text-[11px] leading-relaxed text-fg outline-none transition-colors focus:border-accent"
          spellcheck="false"
        />
        <div class="flex justify-end">
          <button
            type="button"
            class="cursor-pointer rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white"
            @click="submit"
          >
            注入
          </button>
        </div>
      </div>
    </div>
  </template>

  <!-- 内联折叠模式（备用） -->
  <section v-else class="rounded-lg border border-dashed border-border bg-elevated">
    <button
      type="button"
      class="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-left"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="flex items-center gap-2 text-[12px] font-medium text-fg-secondary">
        <Bug class="h-3.5 w-3.5 text-fg-muted" />
        调试：手动注入匹配数据
      </span>
      <ChevronDown
        class="h-3.5 w-3.5 text-fg-muted transition-transform duration-200"
        :class="open ? 'rotate-180' : ''"
      />
    </button>

    <div v-if="open" class="space-y-3 border-t border-border px-4 pb-4 pt-3">
      <textarea
        v-model="input"
        class="h-40 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 font-mono text-[11px] leading-relaxed text-fg outline-none focus:border-accent"
        spellcheck="false"
      />
      <div class="flex justify-end">
        <button
          type="button"
          class="cursor-pointer rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white"
          @click="submit"
        >
          注入匹配数据
        </button>
      </div>
    </div>
  </section>
</template>
