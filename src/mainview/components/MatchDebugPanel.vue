<script setup lang="ts">
import { formatDebugLogEntriesForCopy } from '@core/log/format-debug-log';
import type { DebugLogEntry } from '@core/log/types';
import type { WatcherStatus } from '@core/types';
import { MOCK_RELEASE_NOTES } from '@core/update/mock-release-notes';
import { Bug, ChevronDown, Code2, MessageSquare, ScrollText, X } from 'lucide-vue-next';
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue';
import { getActivePlatform } from '@platforms/registry';
import {
  filterP5eLogEntries,
  P5E_LOG_FILTER_OPTIONS,
  type P5eLogFilterKey,
} from '@platforms/5e/debug-log-filter';
import {
  p5eSimulateClientNotFound,
  toggleP5eSimulateClientNotFound,
} from '@platforms/5e/p5e-dev-overrides';
import type { useP5eCdp } from '../composables/useP5eCdp';
import type { useComments } from '../composables/useComments';
import type { MatchHistoryApi } from '../composables/useMatchHistory';
import { formatAppVersion, useUpdateCheck } from '../composables/useUpdateCheck';
import { closeAppDevtools, openAppDevtools } from '../utils/devtools';
import { showToast, useCopyFeedback } from '../composables/useCopyFeedback';
import {
  collectRuntimeDiagnostics,
  formatRuntimeDiagnostics,
} from '../utils/runtime-diagnostics';
import {
  seedMockMatchHistory,
  type MockHistoryPlatformMix,
} from '../utils/matchHistoryMock';
import { currentLocale, localize as l, localizeErrorMessage } from '../i18n';

const { copyText } = useCopyFeedback();
const MatchDebugWidgetPanel = defineAsyncComponent(
  () => import('./MatchDebugWidgetPanel.vue'),
);
const props = withDefaults(
  defineProps<{
    placement?: 'header' | 'floating' | 'inline';
    initialOpen?: boolean;
    logEntries?: DebugLogEntry[];
    watcher?: WatcherStatus;
    injectAiResult?: (raw: string) => Promise<string | null>;
    replayPerfectFixture?: () => Promise<void>;
    p5e?: ReturnType<typeof useP5eCdp>;
    comments?: ReturnType<typeof useComments>;
    matchHistory?: MatchHistoryApi;
  }>(),
  {
    placement: 'inline',
    initialOpen: false,
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
type InjectSubTab = 'match' | 'p5e' | 'ai' | 'comments' | 'history' | 'update' | 'widget' | 'runtime';
type LogSubTab = 'perfect' | 'p5e';

const isDev = import.meta.env.DEV;

const runtimeDiagnostics = collectRuntimeDiagnostics();
const runtimeDiagnosticsText = computed(() => formatRuntimeDiagnostics(runtimeDiagnostics));

const {
  state: updateState,
  formattedVersion,
  simulateUpdate,
  clearUpdateHint,
  openDialog: openUpdateDialog,
} = useUpdateCheck();

const open = ref(props.initialOpen);
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
const mockReleaseNotes = ref(MOCK_RELEASE_NOTES);
const p5eLogFilter = ref<P5eLogFilterKey>('all');
const p5eLogSearch = ref('');
const historySeedCount = ref(25);
const historyPlatformMix = ref<MockHistoryPlatformMix>('both');
const historyWithAi = ref(true);
const historyBusy = ref(false);
const historyError = ref('');
const perfectReplayBusy = ref(false);

async function runPerfectReplay() {
  if (!props.replayPerfectFixture || perfectReplayBusy.value) return;
  perfectReplayBusy.value = true;
  error.value = '';
  try {
    await props.replayPerfectFixture();
  } catch (reason) {
    error.value = localizeErrorMessage(reason instanceof Error ? reason.message : String(reason));
  } finally {
    perfectReplayBusy.value = false;
  }
}

const p5eLogEntries = computed(() => props.p5e?.logEntries.value ?? []);
const filteredP5eLogEntries = computed(() =>
  filterP5eLogEntries(p5eLogEntries.value, p5eLogFilter.value, p5eLogSearch.value),
);
const activeLogEntries = computed(() =>
  logSubTab.value === 'p5e' ? filteredP5eLogEntries.value : props.logEntries,
);
const totalLogCount = computed(
  () => props.logEntries.length + (props.p5e?.logEntries.value.length ?? 0),
);

const p5ePhaseLabel = computed<Record<string, string>>(() => ({
  idle: l('空闲', 'Idle'),
  launching: l('启动中', 'Launching'),
  cdpReady: l('已连接', 'Connected'),
  collecting: l('采集中', 'Capturing'),
  reconnecting: l('重连中', 'Reconnecting'),
  needsRelaunch: l('需重连', 'Relaunch required'),
  stopped: l('已停止', 'Stopped'),
  error: l('错误', 'Error'),
}));

async function openDevtoolsPanel() {
  devtoolsError.value = '';
  try {
    await openAppDevtools();
  } catch (err) {
    devtoolsError.value = localizeErrorMessage(err);
  }
}

async function closeDevtoolsPanel() {
  devtoolsError.value = '';
  try {
    await closeAppDevtools();
  } catch (err) {
    devtoolsError.value = localizeErrorMessage(err);
  }
}

function toggleClientNotFoundSim() {
  p5eError.value = '';
  toggleP5eSimulateClientNotFound();
}

async function simulateP5eMatch() {
  p5eError.value = '';
  if (!props.p5e) {
    p5eError.value = l('5E 模块未就绪', 'The 5E module is not ready');
    return;
  }
  const record = await props.p5e.simulateFixture();
  if (!record) p5eError.value = props.p5e.lastError.value ?? l('模拟失败', 'Simulation failed');
  else if (props.placement === 'header') open.value = false;
}

function replayP5eNdjson() {
  p5eError.value = '';
  if (!props.p5e) {
    p5eError.value = l('5E 模块未就绪', 'The 5E module is not ready');
    return;
  }
  const bundles = props.p5e.replayNdjson(p5eNdjsonInput.value);
  if (!bundles.length) {
    p5eError.value = l('未解析到有效 5E 匹配事件', 'No valid 5E match events were parsed');
    return;
  }
  p5eNdjsonInput.value = '';
  if (props.placement === 'header') open.value = false;
}

async function toggleP5eGateDebugMode(event: Event) {
  p5eError.value = '';
  if (!props.p5e) {
    p5eError.value = l('5E 模块未就绪', 'The 5E module is not ready');
    return;
  }
  const checked = (event.target as HTMLInputElement).checked;
  try {
    await props.p5e.setGateDebugMode(checked);
  } catch (err) {
    p5eError.value = localizeErrorMessage(err);
  }
}

async function toggleP5eWsDebugMode(event: Event) {
  p5eError.value = '';
  if (!props.p5e) {
    p5eError.value = l('5E 模块未就绪', 'The 5E module is not ready');
    return;
  }
  const checked = (event.target as HTMLInputElement).checked;
  try {
    await props.p5e.setWsDebugMode(checked);
  } catch (err) {
    p5eError.value = localizeErrorMessage(err);
  }
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
    aiError.value = l('请粘贴 AI 分析 JSON', 'Paste an AI analysis JSON payload');
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

async function seedMatchHistory() {
  historyError.value = '';
  if (!props.matchHistory) {
    historyError.value = l('对局历史模块未就绪', 'The match-history module is not ready');
    return;
  }
  historyBusy.value = true;
  try {
    const { saved } = await seedMockMatchHistory(props.matchHistory, {
      count: historySeedCount.value,
      platformMix: historyPlatformMix.value,
      withAi: historyWithAi.value,
    });
    showToast(l(`已填充 ${saved} 条模拟对局`, `Added ${saved} simulated matches`));
    if (props.placement === 'header') open.value = false;
  } catch (err) {
    historyError.value = localizeErrorMessage(err);
  } finally {
    historyBusy.value = false;
  }
}

async function clearMatchHistory() {
  historyError.value = '';
  if (!props.matchHistory) {
    historyError.value = l('对局历史模块未就绪', 'The match-history module is not ready');
    return;
  }
  historyBusy.value = true;
  try {
    await props.matchHistory.clearAll();
    showToast(l('已清空对局历史', 'Match history cleared'));
  } catch (err) {
    historyError.value = localizeErrorMessage(err);
  } finally {
    historyBusy.value = false;
  }
}

const historyListCount = computed(() => props.matchHistory?.listItems.value.length ?? 0);

function switchInjectSubTab(tab: InjectSubTab) {
  injectSubTab.value = tab;
  error.value = '';
  aiError.value = '';
  historyError.value = '';
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

function buildLogCopyMetaLines(): string[] {
  if (logSubTab.value === 'p5e' && props.p5e) {
    const status = props.p5e.status.value;
    return [
      l(`采集: ${status.running ? '采集中' : '未采集'}`, `Capture: ${status.running ? 'active' : 'inactive'}`),
      l(`阶段: ${p5ePhaseLabel.value[status.phase] ?? status.phase}`, `Phase: ${p5ePhaseLabel.value[status.phase] ?? status.phase}`),
      ...(status.port ? [l(`端口: ${status.port}`, `Port: ${status.port}`)] : []),
      l(`事件: ${status.eventsEmitted}`, `Events: ${status.eventsEmitted}`),
      ...(props.p5e.lastError.value ? [l(`错误: ${props.p5e.lastError.value}`, `Error: ${props.p5e.lastError.value}`)] : []),
    ];
  }

  return [
    l(`监听: ${props.watcher.running ? '监听中' : '未监听'}`, `Watcher: ${props.watcher.running ? 'active' : 'inactive'}`),
    l(`已收: ${props.watcher.linesReceived} 行`, `Received: ${props.watcher.linesReceived} lines`),
    l(`日志: ${props.watcher.fileExists ? props.watcher.logPath : '等待日志文件…'}`, `Log: ${props.watcher.fileExists ? props.watcher.logPath : 'Waiting for a log file…'}`),
  ];
}

async function copyAllLogs() {
  const entries = activeLogEntries.value;
  if (!entries.length) {
    showToast(l('暂无日志可复制', 'No logs to copy'), 'warning');
    return;
  }

  const isP5e = logSubTab.value === 'p5e';
  const title = isP5e ? l('CS 匹配助手 · 5E 数据', 'CS Match Helper · 5E data') : l('CS 匹配助手 · 完美日志', 'CS Match Helper · Perfect World logs');
  const text = formatDebugLogEntriesForCopy(entries, {
    title,
    metaLines: buildLogCopyMetaLines(),
    locale: currentLocale(),
  });
  const label = isP5e ? '5E' : l('完美', 'Perfect World');
  await copyText(text, l(`已复制 ${entries.length} 条${label}日志`, `Copied ${entries.length} ${label} log entries`));
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
  () =>
    [
      props.logEntries.length,
      p5eLogEntries.value.length,
      filteredP5eLogEntries.value.length,
      p5eLogFilter.value,
      p5eLogSearch.value,
    ] as const,
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
      @click="toggle"
    >
      <Bug class="h-4 w-4" />
      <span class="hidden sm:inline">{{ l('调试', 'Debug') }}</span>
    </button>

    <div
      v-if="open"
      class="absolute right-28 top-full z-50 mt-0 w-[min(560px,calc(100vw-2rem))] overflow-hidden rounded-b-xl border border-t-0 border-border bg-surface shadow-xl"
    >
      <div class="flex items-center justify-between border-b border-border bg-elevated px-4 py-2.5">
        <span class="flex items-center gap-2 text-[12px] font-medium text-fg-secondary">
          <Bug class="h-3.5 w-3.5 text-fg-muted" />
          {{ l('调试面板', 'Debug panel') }}
        </span>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-base hover:text-fg-secondary"
            :title="l('打开 WebView 开发者工具（F12 / Ctrl+Shift+I）', 'Open WebView developer tools (F12 / Ctrl+Shift+I)')"
            @click="openDevtoolsPanel"
          >
            <Code2 class="h-3.5 w-3.5" />
            DevTools
          </button>
          <button
            type="button"
            class="cursor-pointer rounded p-1 text-fg-muted transition-colors hover:bg-base hover:text-fg-secondary"
            :aria-label="l('关闭', 'Close')"
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
          {{ l('注入数据', 'Inject data') }}
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
          {{ l('日志输出', 'Logs') }}
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
        <div class="debug-inject-tabs mb-3 -mx-1 overflow-x-auto px-1">
          <div class="inline-flex min-w-full gap-0.5 rounded-lg bg-elevated p-0.5">
            <button
              type="button"
              class="shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors"
              :class="
                injectSubTab === 'match'
                  ? 'bg-surface text-fg shadow-sm'
                  : 'text-fg-muted hover:text-fg-secondary'
              "
              @click="switchInjectSubTab('match')"
            >
              {{ l('匹配', 'Match') }}
            </button>
            <button
              v-if="isDev"
              type="button"
              class="shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors"
              :class="
                injectSubTab === 'p5e'
                  ? 'bg-surface text-fg shadow-sm'
                  : 'text-fg-muted hover:text-fg-secondary'
              "
              @click="switchInjectSubTab('p5e')"
            >
              5E
            </button>
            <button
              type="button"
              class="shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors"
              :class="
                injectSubTab === 'ai'
                  ? 'bg-surface text-fg shadow-sm'
                  : 'text-fg-muted hover:text-fg-secondary'
              "
              @click="switchInjectSubTab('ai')"
            >
              AI
            </button>
            <button
              type="button"
              class="shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors"
              :class="
                injectSubTab === 'comments'
                  ? 'bg-surface text-fg shadow-sm'
                  : 'text-fg-muted hover:text-fg-secondary'
              "
              @click="switchInjectSubTab('comments')"
            >
              {{ l('评论', 'Comments') }}
            </button>
            <button
              type="button"
              class="shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors"
              :class="
                injectSubTab === 'history'
                  ? 'bg-surface text-fg shadow-sm'
                  : 'text-fg-muted hover:text-fg-secondary'
              "
              @click="switchInjectSubTab('history')"
            >
              {{ l('历史', 'History') }}
            </button>
            <button
              type="button"
              class="shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors"
              :class="
                injectSubTab === 'update'
                  ? 'bg-surface text-fg shadow-sm'
                  : 'text-fg-muted hover:text-fg-secondary'
              "
              @click="switchInjectSubTab('update')"
            >
              {{ l('更新', 'Update') }}
            </button>
            <button
              type="button"
              class="shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors"
              :class="
                injectSubTab === 'widget'
                  ? 'bg-surface text-fg shadow-sm'
                  : 'text-fg-muted hover:text-fg-secondary'
              "
              @click="switchInjectSubTab('widget')"
            >
              Widget
            </button>
            <button
              type="button"
              class="shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors"
              :class="
                injectSubTab === 'runtime'
                  ? 'bg-surface text-fg shadow-sm'
                  : 'text-fg-muted hover:text-fg-secondary'
              "
              @click="switchInjectSubTab('runtime')"
            >
              {{ l('运行时', 'Runtime') }}
            </button>
          </div>
        </div>

        <div v-if="injectSubTab === 'match'" class="space-y-3">
          <p class="text-[11px] leading-relaxed text-fg-muted">
            {{ l('离线回放真实完美天梯事件：逐人 ready、数据返回、10/10 等待与最终分队。', 'Replay a real Perfect ladder session offline: progressive ready, data loading, waiting, and team assignment.') }}
          </p>
          <div class="rounded-md border border-border bg-elevated px-3 py-2.5">
            <p class="text-[11px] text-fg-secondary">9220102482485790732 · de_dust2 · 10 players</p>
            <button
              type="button"
              class="mt-2 min-h-10 cursor-pointer rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors duration-200 hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60"
              :disabled="perfectReplayBusy"
              @click="runPerfectReplay"
            >
              {{ perfectReplayBusy ? l('回放中…', 'Replaying…') : l('一键回放完美平台', 'Replay Perfect session') }}
            </button>
          </div>
          <p v-if="error" class="text-[11px] text-danger">{{ error }}</p>
          <details class="rounded-md border border-border bg-base px-3 py-2">
            <summary class="cursor-pointer text-[11px] font-medium text-fg-secondary">{{ l('高级：手动 JSON 注入', 'Advanced: manual JSON injection') }}</summary>
            <textarea
              v-model="input"
              class="mt-2 h-36 w-full resize-y rounded-md border border-border bg-base px-3 py-2 font-mono text-[11px] leading-relaxed text-fg outline-none transition-colors focus:border-accent"
              placeholder='{"platform_game_id":"...","map_name":"de_dust2","players":[...]}'
              spellcheck="false"
            />
            <div class="mt-2 flex justify-end">
              <button type="button" class="min-h-10 cursor-pointer rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors duration-200 hover:bg-accent-hover" @click="submit">
                {{ l('注入', 'Inject') }}
              </button>
            </div>
          </details>
        </div>

        <div v-else-if="isDev && injectSubTab === 'p5e'" class="space-y-3">
          <p class="text-[11px] leading-relaxed text-fg-muted">
            {{ l('一键模拟 5E 匹配成功，或粘贴 NDJSON 逐行回放（自动过滤 token/curl）。', 'Simulate a successful 5E match or paste NDJSON for line-by-line replay. Tokens and curl data are filtered automatically.') }}
          </p>
          <div class="rounded-md border border-border bg-elevated px-3 py-2.5">
            <p class="text-[11px] leading-relaxed text-fg-secondary">
              {{ l('启动页调试：模拟未安装 5E 时，启动页会提示填写路径且无法点击「立即启动」。', 'Launch-screen test: simulate a missing 5E install so the path is required and Launch now remains disabled.') }}
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
                {{ p5eSimulateClientNotFound ? l('关闭「找不到客户端」模拟', 'Disable missing-client simulation') : l('模拟找不到客户端', 'Simulate missing client') }}
              </button>
              <span class="text-[10px] text-fg-muted">
                {{ l('当前', 'Current') }}: {{ p5eSimulateClientNotFound ? l('已开启', 'Enabled') : l('未开启', 'Disabled') }}
              </span>
            </div>
          </div>
          <button
            type="button"
            class="w-full cursor-pointer rounded-md bg-accent px-3 py-2 text-[12px] font-medium text-white transition-colors hover:bg-accent-hover"
            @click="simulateP5eMatch"
          >
            {{ l('模拟 5E 匹配成功', 'Simulate successful 5E match') }}
          </button>
          <textarea
            v-model="p5eNdjsonInput"
            class="h-28 w-full resize-y rounded-md border border-border bg-base px-3 py-2 font-mono text-[11px] leading-relaxed text-fg outline-none transition-colors focus:border-accent"
            :placeholder="l('粘贴 5e-match-events.ndjson 内容…', 'Paste 5e-match-events.ndjson content…')"
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
              {{ l('NDJSON 回放', 'Replay NDJSON') }}
            </button>
          </div>
        </div>

        <div v-else-if="injectSubTab === 'ai'" class="space-y-3">
          <p class="text-[11px] leading-relaxed text-fg-muted">
            {{ l('粘贴 AI 分析 JSON，直接预览结果面板（需先有当前匹配数据）。', 'Paste AI analysis JSON to preview the result panel. Current match data is required.') }}
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
              {{ l('注入 AI 结果', 'Inject AI result') }}
            </button>
          </div>
        </div>

        <div v-else-if="injectSubTab === 'comments'" class="space-y-3">
          <p class="text-[11px] leading-relaxed text-fg-muted">
            {{ l('打开带 Mock 数据的评论抽屉，或填充设置页「我的评论」列表（不请求接口）。', 'Open the comments drawer with mock data or populate My comments in Settings without making API requests.') }}
          </p>
          <div class="rounded-md border border-border bg-base px-3 py-2.5 text-[11px] leading-relaxed text-fg-secondary">
            <p>{{ l('玩家', 'Player') }}: DebugPlayer_Mock</p>
            <p class="mt-1">SteamID：76561198000000001</p>
            <p class="mt-1">{{ l('Mock 列表含 5 条评论（含 1 条自己的评论）', 'Mock list: 5 comments, including 1 from you') }}</p>
            <p class="mt-1">{{ l('Mock 历史含 5 条评论（3 个不同 SteamID）', 'Mock history: 5 comments across 3 Steam IDs') }}</p>
          </div>
          <button
            type="button"
            class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-[12px] font-medium text-white transition-colors duration-200 hover:bg-accent-hover"
            @click="openMockComments('list')"
          >
            <MessageSquare class="h-3.5 w-3.5" aria-hidden="true" />
            {{ l('打开 Mock 评论抽屉', 'Open mock comments drawer') }}
          </button>
          <button
            type="button"
            class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-[12px] font-medium text-accent transition-colors duration-200 hover:bg-accent/10"
            @click="fillMockHistory"
          >
            <MessageSquare class="h-3.5 w-3.5" aria-hidden="true" />
            {{ l('填充我的评论', 'Populate My comments') }}
          </button>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
              @click="openMockComments('empty')"
            >
              {{ l('空状态', 'Empty state') }}
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
              @click="openMockComments('loading')"
            >
              {{ l('加载中', 'Loading') }}
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
              @click="openMockComments('error')"
            >
              {{ l('错误态', 'Error state') }}
            </button>
          </div>
        </div>

        <div v-else-if="injectSubTab === 'history'" class="space-y-3">
          <p class="text-[11px] leading-relaxed text-fg-muted">
            {{ l('批量写入本地对局历史，覆盖多地图、完美/5E 平台与部分 AI 分析，便于测试列表分页与详情补分析。', 'Seed local match history across maps and platforms, with some AI results, to test pagination and analysis regeneration.') }}
          </p>
          <div class="rounded-md border border-border bg-base px-3 py-2.5 text-[11px] leading-relaxed text-fg-secondary">
            <p>{{ l('当前历史', 'Current history') }}: {{ historyListCount }}</p>
            <p class="mt-1">{{ l('5E 记录含 p5eBundle，可测试「补 AI 分析」数据保真', '5E records include p5eBundle for testing lossless AI regeneration') }}</p>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <label class="space-y-1">
              <span class="text-[11px] font-medium text-fg-secondary">{{ l('条数', 'Count') }}</span>
              <input
                v-model.number="historySeedCount"
                type="number"
                min="1"
                max="200"
                class="w-full rounded-md border border-border bg-base px-2.5 py-1.5 text-[12px] text-fg outline-none transition-colors focus:border-accent"
              />
            </label>
            <label class="space-y-1">
              <span class="text-[11px] font-medium text-fg-secondary">{{ l('平台', 'Platform') }}</span>
              <select
                v-model="historyPlatformMix"
                class="w-full cursor-pointer rounded-md border border-border bg-base px-2.5 py-1.5 text-[12px] text-fg outline-none transition-colors focus:border-accent"
              >
                <option value="both">{{ l('完美 + 5E 交替', 'Alternate Perfect World + 5E') }}</option>
                <option value="perfect">{{ l('仅完美', 'Perfect World only') }}</option>
                <option value="5e">{{ l('仅 5E', '5E only') }}</option>
              </select>
            </label>
          </div>
          <label class="flex cursor-pointer items-center gap-2 text-[11px] text-fg-secondary">
            <input
              v-model="historyWithAi"
              type="checkbox"
              class="h-3.5 w-3.5 cursor-pointer rounded border-border accent-accent"
            />
            {{ l('约每 3 条写入 1 条 AI 分析', 'Include AI analysis in about 1 of every 3 matches') }}
          </label>
          <div class="flex flex-wrap justify-end gap-2">
            <p v-if="historyError" class="mr-auto text-[11px] text-danger">{{ historyError }}</p>
            <button
              type="button"
              class="cursor-pointer rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="historyBusy || !matchHistory"
              @click="clearMatchHistory"
            >
              {{ l('清空历史', 'Clear history') }}
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="historyBusy || !matchHistory"
              @click="seedMatchHistory"
            >
              {{ historyBusy ? l('写入中…', 'Writing…') : l('填充模拟历史', 'Seed mock history') }}
            </button>
          </div>
        </div>

        <div v-else-if="injectSubTab === 'update'" class="space-y-3">
          <p class="text-[11px] leading-relaxed text-fg-muted">
            {{ l('模拟检测到新版本，用于测试标题栏与关于页的更新提示和弹窗。', 'Simulate an available update to test title-bar and About-page indicators and dialogs.') }}
          </p>
          <div class="rounded-md border border-border bg-base px-3 py-2.5 text-[11px] leading-relaxed text-fg-secondary">
            <p>{{ l('当前版本', 'Current version') }}: {{ formattedVersion || l('加载中…', 'Loading…') }}</p>
            <p class="mt-1">
              {{ l('模拟状态', 'Simulation status') }}:
              <span :class="updateState.hasUpdate ? 'text-warning' : 'text-fg-muted'">
                {{ updateState.hasUpdate ? l(`有新版本 ${formatAppVersion(updateState.latestVersion)}`, `Update available ${formatAppVersion(updateState.latestVersion)}`) : l('无更新提示', 'No update indicator') }}
              </span>
            </p>
          </div>
          <div class="space-y-1.5">
            <label class="text-[11px] font-medium text-fg-secondary" for="mock-release-notes">
              {{ l('模拟更新内容（Markdown）', 'Mock release notes (Markdown)') }}
            </label>
            <textarea
              id="mock-release-notes"
              v-model="mockReleaseNotes"
              class="h-40 w-full resize-y rounded-md border border-border bg-base px-3 py-2 font-mono text-[11px] leading-relaxed text-fg outline-none transition-colors focus:border-accent"
              :placeholder="l('## 更新内容\n\n- 第一条更新说明', '## What’s new\n\n- First release note')"
              spellcheck="false"
            />
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              class="cursor-pointer rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
              :disabled="!updateState.hasUpdate"
              @click="clearUpdateHint"
            >
              {{ l('清除提示', 'Clear indicator') }}
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
              :disabled="!updateState.hasUpdate"
              @click="openUpdateDialog"
            >
              {{ l('打开弹窗', 'Open dialog') }}
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors duration-200 hover:bg-accent-hover"
              @click="simulateUpdate(mockReleaseNotes)"
            >
              {{ l('模拟检测到新版本', 'Simulate update') }}
            </button>
          </div>
        </div>

        <MatchDebugWidgetPanel v-else-if="injectSubTab === 'widget'" />

        <div v-else-if="injectSubTab === 'runtime'" class="space-y-3">
          <p class="text-[11px] leading-relaxed text-fg-muted">
            {{ l('WebView2 与动画能力诊断，用于排查其他电脑上的界面/动画异常。', 'WebView2 and animation diagnostics for investigating rendering issues on other computers.') }}
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="flex cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors duration-200 hover:bg-accent-hover"
              @click="openDevtoolsPanel"
            >
              <Code2 class="h-3.5 w-3.5" />
              {{ l('打开开发者工具', 'Open developer tools') }}
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
              @click="closeDevtoolsPanel"
            >
              {{ l('关闭开发者工具', 'Close developer tools') }}
            </button>
          </div>
          <p class="text-[10px] text-fg-muted">
            {{ l('快捷键', 'Shortcut') }}: F12 {{ l('或', 'or') }} Ctrl+Shift+I<span v-if="!isDev">{{ l('（需先解锁调试模式）', ' (unlock Debug mode first)') }}</span>
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
            {{ l('完美日志', 'Perfect World logs') }}
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
            {{ l('5E 数据', '5E data') }}
            <span v-if="p5eLogEntries.length" class="ml-1 text-fg-muted">({{ p5eLogEntries.length }})</span>
          </button>
        </div>

        <div
          class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2 text-[10px] text-fg-muted"
        >
          <template v-if="logSubTab === 'p5e' && p5e">
            <span :class="p5e.status.value.running ? 'text-success' : 'text-fg-muted'">
              {{ p5e.status.value.running ? l('采集中', 'Capturing') : l('未采集', 'Not capturing') }}
            </span>
            <span>{{ l('阶段', 'Phase') }} {{ p5ePhaseLabel[p5e.status.value.phase] ?? p5e.status.value.phase }}</span>
            <span v-if="p5e.status.value.port">{{ l('端口', 'Port') }} {{ p5e.status.value.port }}</span>
            <span>{{ l('事件', 'Events') }} {{ p5e.status.value.eventsEmitted }}</span>
            <span v-if="p5e.captureProgress.value" class="text-accent">
              {{ l('采集', 'Captured') }} {{ p5e.captureProgress.value.collected }}/{{ p5e.captureProgress.value.total }}
              <template v-if="p5e.captureProgress.value.missing.length">
                · {{ l('缺', 'missing') }} {{ p5e.captureProgress.value.missing.join(', ') }}
              </template>
            </span>
            <span>{{ l('展示', 'Showing') }} {{ filteredP5eLogEntries.length }}/{{ p5eLogEntries.length }}</span>
            <span v-if="p5e.lastError.value" class="text-danger truncate" :title="p5e.lastError.value">
              {{ l('错误', 'Error') }}: {{ p5e.lastError.value }}
            </span>
          </template>
          <template v-else>
            <span :class="watcher.running ? 'text-success' : 'text-fg-muted'">
              {{ watcher.running ? l('监听中', 'Watching') : l('未监听', 'Not watching') }}
            </span>
            <span>{{ l('已收', 'Received') }} {{ watcher.linesReceived }} {{ l('行', 'lines') }}</span>
            <span>{{ l('展示', 'Showing') }} {{ logEntries.length }}</span>
            <span class="truncate" :title="watcher.logPath">
              {{ watcher.fileExists ? watcher.logPath : l('等待日志文件…', 'Waiting for a log file…') }}
            </span>
          </template>
          <div class="ml-auto flex items-center gap-2">
            <label
              v-if="logSubTab === 'p5e' && p5e"
              class="flex cursor-pointer items-center gap-1"
              :title="l('监听 Comet WebSocket 帧（解码后输出到本页），不参与匹配聚合', 'Capture decoded Comet WebSocket frames on this page without using them for match aggregation')"
            >
              <input
                type="checkbox"
                class="accent-accent"
                :checked="p5e.wsDebugMode.value"
                @change="toggleP5eWsDebugMode"
              />
              {{ l('WS 调试', 'WS debug') }}
            </label>
            <label
              v-if="logSubTab === 'p5e' && p5e"
              class="flex cursor-pointer items-center gap-1"
              :title="l('记录 gate.5eplay.com 全部 HTTP 请求（分类：Gate 调试），不参与匹配聚合', 'Record all gate.5eplay.com HTTP requests under Gate debug without using them for match aggregation')"
            >
              <input
                type="checkbox"
                class="accent-accent"
                :checked="p5e.gateDebugMode.value"
                @change="toggleP5eGateDebugMode"
              />
              {{ l('Gate 调试', 'Gate debug') }}
            </label>
            <label class="flex cursor-pointer items-center gap-1">
              <input v-model="autoScroll" type="checkbox" class="accent-accent" />
              {{ l('自动滚动', 'Auto-scroll') }}
            </label>
            <button
              type="button"
              class="cursor-pointer rounded px-2 py-0.5 text-[10px] text-fg-muted transition-colors hover:bg-elevated hover:text-fg-secondary disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="!activeLogEntries.length"
              :title="
                logSubTab === 'p5e'
                  ? l('复制当前筛选后的 5E 数据列表（完整内容）', 'Copy the complete filtered 5E data list')
                  : l('复制当前完美日志列表（完整内容）', 'Copy the complete Perfect World log list')
              "
              @click="copyAllLogs"
            >
              {{ l('复制全部', 'Copy all') }}
            </button>
            <button
              type="button"
              class="cursor-pointer rounded px-2 py-0.5 text-[10px] text-fg-muted transition-colors hover:bg-elevated hover:text-fg-secondary"
              @click="clearLogs"
            >
              {{ l('清空', 'Clear') }}
            </button>
          </div>
        </div>

        <div
          v-if="logSubTab === 'p5e' && p5e"
          class="flex flex-wrap items-center gap-2 border-b border-border bg-base px-4 py-2"
        >
          <div class="flex flex-wrap items-center gap-1">
            <button
              v-for="opt in P5E_LOG_FILTER_OPTIONS"
              :key="opt.key"
              type="button"
              class="cursor-pointer rounded px-2 py-0.5 text-[10px] transition-colors"
              :class="
                p5eLogFilter === opt.key
                  ? 'bg-accent/15 text-accent'
                  : 'text-fg-muted hover:bg-elevated hover:text-fg-secondary'
              "
              @click="p5eLogFilter = opt.key"
            >
              {{ opt.key === 'all' ? l('全部', 'All') : opt.key === 'status' ? l('状态', 'Status') : opt.key === 'match' ? l('匹配', 'Match') : opt.label }}
            </button>
          </div>
          <input
            v-model="p5eLogSearch"
            type="search"
            :placeholder="l('搜索内容…', 'Search…')"
            class="ml-auto min-w-32 flex-1 rounded border border-border bg-surface px-2 py-1 text-[10px] text-fg outline-none focus:border-accent/50 sm:max-w-48 sm:flex-none"
          />
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
              <template v-if="p5eLogEntries.length">
                {{ l('当前筛选无结果。可切换分类或清空搜索关键词。', 'No results for the current filters. Change category or clear the search.') }}
              </template>
              <template v-else>
                {{ l('暂无 5E 数据。启动 5E 并开始匹配后，采集到的 API 与 WebSocket 解码内容会显示在这里。', 'No 5E data yet. Captured API and decoded WebSocket data will appear here after 5E starts matchmaking.') }}
              </template>
            </template>
            <template v-else>
              {{ l('暂无日志。开始监听后，每行 log 的解析结果会显示在这里。', 'No logs yet. Parsed log lines will appear here after watching starts.') }}
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
                {{ l('匹配事件', 'Match event') }}
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
              {{ expandedIds.has(entry.id) ? l('收起', 'Collapse') : l('展开详情', 'Show details') }}
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
      :title="l('调试', 'Debug')"
      @click="open = true"
    >
      <Bug class="h-3.5 w-3.5" />
      {{ l('调试', 'Debug') }}
    </button>

    <div
      v-else
      class="absolute bottom-5 right-5 z-20 w-[min(420px,calc(100vw-2.5rem))] overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
    >
      <div class="flex items-center justify-between border-b border-border bg-elevated px-4 py-2.5">
        <span class="flex items-center gap-2 text-[12px] font-medium text-fg-secondary">
          <Bug class="h-3.5 w-3.5 text-fg-muted" />
          {{ l('注入匹配数据', 'Inject match data') }}
        </span>
        <button
          type="button"
          class="cursor-pointer rounded p-1 text-fg-muted transition-colors hover:bg-base hover:text-fg-secondary"
          :aria-label="l('关闭', 'Close')"
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
            {{ l('注入', 'Inject') }}
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
        {{ l('调试：手动注入匹配数据', 'Debug: manually inject match data') }}
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
          {{ l('注入匹配数据', 'Inject match data') }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.debug-inject-tabs {
  scrollbar-width: none;
}
.debug-inject-tabs::-webkit-scrollbar {
  display: none;
}
</style>
