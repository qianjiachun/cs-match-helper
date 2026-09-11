<script setup lang="ts">
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Copy,
  Database,
  LoaderCircle,
  Play,
  ShieldCheck,
  SkipForward,
  UserRound,
  X,
} from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import {
  buildPerfectApiFieldChecks,
  diagnosePerfectApiReport,
  formatPerfectApiDebugReport,
  isPerfectSteamId64,
  type PerfectApiDebugEndpoint,
  type PerfectApiDebugEndpointId,
  type PerfectApiDebugReport,
  type PerfectApiFieldKey,
} from '@platforms/perfect/api-debug';
import type { PerfectAuthStatus } from '@platforms/perfect/auth';
import { normalizePerfectPlayerStats } from '@platforms/perfect/player-api';
import type { PerfectPlayerStats } from '@platforms/perfect/types';
import { useCopyFeedback } from '../composables/useCopyFeedback';
import { localize as l, localizeErrorMessage } from '../i18n';
import { debugPerfectPlayerApis } from '../native';

const props = defineProps<{
  authStatus?: PerfectAuthStatus;
}>();

const { copyText } = useCopyFeedback();
const targetSteamId = ref('');
const busy = ref(false);
const error = ref('');
const report = ref<PerfectApiDebugReport | null>(null);
const expandedEndpointIds = ref<Set<PerfectApiDebugEndpointId>>(new Set());
const aggregateExpanded = ref(false);

const normalization = computed<{ stats: PerfectPlayerStats | null; error: string }>(() => {
  if (!report.value?.aggregate) return { stats: null, error: '' };
  try {
    return {
      stats: normalizePerfectPlayerStats(report.value.aggregate, report.value.targetSteamId),
      error: '',
    };
  } catch (reason) {
    return {
      stats: null,
      error: reason instanceof Error ? reason.message : String(reason),
    };
  }
});

const fieldChecks = computed(() => buildPerfectApiFieldChecks(normalization.value.stats));
const diagnosis = computed(() => report.value
  ? diagnosePerfectApiReport(report.value, normalization.value.stats, normalization.value.error)
  : null);
const successCount = computed(() => report.value?.endpoints.filter((item) => item.status === 'success').length ?? 0);
const failureCount = computed(() => report.value?.endpoints.filter((item) => item.status === 'error').length ?? 0);
const totalDuration = computed(() => report.value?.endpoints.reduce((sum, item) => sum + item.durationMs, 0) ?? 0);

const diagnosisTone = computed(() => {
  if (diagnosis.value === 'complete') return 'border-success/25 bg-success/8 text-success';
  if (diagnosis.value === 'overview-failed' || diagnosis.value === 'aggregate-invalid') {
    return 'border-danger/25 bg-danger/8 text-danger';
  }
  return 'border-warning/25 bg-warning/8 text-warning';
});

function authLabel(): string {
  if (props.authStatus?.phase === 'authenticated') return l('完美账号已登录', 'Perfect World account signed in');
  return l('完美账号未登录', 'Perfect World account not signed in');
}

function useSignedInAccount() {
  if (props.authStatus?.uid) targetSteamId.value = props.authStatus.uid;
}

async function runDiagnostics() {
  const steamId = targetSteamId.value.trim();
  error.value = '';
  if (steamId && !isPerfectSteamId64(steamId)) {
    error.value = l('SteamID64 必须是 17 位数字', 'SteamID64 must contain exactly 17 digits');
    return;
  }
  busy.value = true;
  report.value = null;
  expandedEndpointIds.value = new Set();
  aggregateExpanded.value = false;
  try {
    const next = await debugPerfectPlayerApis(steamId || undefined);
    report.value = next;
    targetSteamId.value = next.targetSteamId;
    expandedEndpointIds.value = new Set(
      next.endpoints.filter((item) => item.status !== 'success').map((item) => item.id),
    );
  } catch (reason) {
    error.value = localizeErrorMessage(reason);
  } finally {
    busy.value = false;
  }
}

function toggleEndpoint(id: PerfectApiDebugEndpointId) {
  const next = new Set(expandedEndpointIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedEndpointIds.value = next;
}

function endpointTitle(id: PerfectApiDebugEndpointId): string {
  const labels: Record<PerfectApiDebugEndpointId, string> = {
    overview: l('用户概览', 'User overview'),
    'season-list': l('赛季列表', 'Season list'),
    'season-stats': l('赛季统计', 'Season stats'),
    'board-search': l('留言板身份搜索', 'Board identity search'),
  };
  return labels[id];
}

function endpointStatusLabel(endpoint: PerfectApiDebugEndpoint): string {
  if (endpoint.status === 'success') return l('成功', 'Success');
  if (endpoint.status === 'error') return l('失败', 'Failed');
  return l('跳过', 'Skipped');
}

function endpointStatusClass(endpoint: PerfectApiDebugEndpoint): string {
  if (endpoint.status === 'success') return 'bg-success/10 text-success';
  if (endpoint.status === 'error') return 'bg-danger/10 text-danger';
  return 'bg-elevated text-fg-muted';
}

function fieldLabel(key: PerfectApiFieldKey): string {
  const labels: Record<PerfectApiFieldKey, string> = {
    elo: 'ELO',
    peakRank: l('最高分', 'Peak'),
    rating: 'Rating',
    adr: 'ADR',
    headshot: l('爆头率', 'HS%'),
    rapidStop: l('急停', 'Counter-strafe'),
    reactionTime: l('反应', 'Reaction'),
    maps: l('地图', 'Maps'),
    weapons: l('武器', 'Weapons'),
  };
  return labels[key];
}

function diagnosisText(): string {
  switch (diagnosis.value) {
    case 'overview-failed':
      return l('用户概览请求失败，聚合层没有基础玩家数据。', 'The overview request failed, so the aggregate has no base player data.');
    case 'season-unresolved':
      return l('未解析到当前赛季，因此赛季统计请求被跳过。', 'No current season was resolved, so the season-stats request was skipped.');
    case 'season-mismatch':
      return l('用户概览与赛季列表给出的赛季不一致，可能查询了错误赛季。', 'Overview and season-list disagree, so the wrong season may have been queried.');
    case 'season-stats-failed':
      return l('赛季统计请求失败；最高分、爆头率、急停、反应、地图和武器会因此缺失。', 'Season stats failed; peak rank, HS%, counter-strafe, reaction, maps, and weapons will be missing.');
    case 'aggregate-invalid':
      return l('接口有响应，但聚合结果无法通过前端字段解析。', 'The endpoints responded, but the aggregate could not be normalized by the frontend.');
    case 'important-fields-missing':
      return l('请求成功，但关键字段仍缺失，优先检查原始响应字段结构。', 'Requests succeeded, but important fields are still missing; inspect the raw response shape.');
    case 'complete':
      return l('玩家数据链路完整，关键字段均可由前端解析。', 'The player-data pipeline is complete and all important fields can be normalized.');
    default:
      return '';
  }
}

function seasonSourceLabel(): string {
  if (report.value?.seasonSource === 'overview') return 'overview';
  if (report.value?.seasonSource === 'season-list') return 'season-list';
  return '—';
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

async function copyEndpoint(endpoint: PerfectApiDebugEndpoint) {
  await copyText(formatJson(endpoint), l(`已复制 ${endpointTitle(endpoint.id)} 数据`, `Copied ${endpointTitle(endpoint.id)} data`));
}

async function copyReport() {
  if (!report.value) return;
  await copyText(
    formatPerfectApiDebugReport(report.value, normalization.value.stats, normalization.value.error),
    l('已复制完美 API 诊断报告', 'Perfect API diagnostic report copied'),
  );
}

function clearReport() {
  report.value = null;
  error.value = '';
  expandedEndpointIds.value = new Set();
  aggregateExpanded.value = false;
}

watch(
  () => props.authStatus?.uid,
  (uid) => {
    if (uid && !targetSteamId.value) targetSteamId.value = uid;
  },
  { immediate: true },
);
</script>

<template>
  <div class="max-h-[min(72vh,680px)] overflow-y-auto p-4">
    <div class="flex min-h-10 items-center justify-between gap-3 border-b border-border pb-3">
      <div class="flex min-w-0 items-center gap-2.5">
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          :class="authStatus?.phase === 'authenticated' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'"
        >
          <ShieldCheck class="h-4 w-4" aria-hidden="true" />
        </span>
        <div class="min-w-0">
          <div class="text-[11px] font-medium text-fg-secondary">{{ authLabel() }}</div>
          <div class="truncate font-mono text-[10px] tabular-nums text-fg-muted">
            {{ authStatus?.uid || '—' }}<template v-if="authStatus?.name"> · {{ authStatus.name }}</template>
          </div>
        </div>
      </div>
      <span class="shrink-0 rounded bg-elevated px-2 py-1 text-[9px] text-fg-muted">{{ l('当前会话', 'Current session') }}</span>
    </div>

    <form class="space-y-2.5 py-3" @submit.prevent="runDiagnostics">
      <label class="block text-[10px] font-medium text-fg-secondary" for="perfect-api-steam-id">
        {{ l('目标 SteamID64', 'Target SteamID64') }}
      </label>
      <div class="flex flex-wrap gap-2 sm:flex-nowrap">
        <input
          id="perfect-api-steam-id"
          v-model="targetSteamId"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          class="h-10 min-w-0 flex-1 rounded-md border border-border bg-base px-3 font-mono text-[11px] tabular-nums text-fg outline-none transition-[border-color,box-shadow] duration-150 focus:border-accent focus:ring-2 focus:ring-accent/10"
          :placeholder="l('留空使用当前登录账号', 'Leave blank to use the signed-in account')"
          :aria-invalid="Boolean(error)"
        />
        <button
          type="button"
          class="flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-[11px] font-medium text-fg-secondary transition-[background-color,color,scale] duration-150 ease-out hover:bg-elevated hover:text-fg active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45"
          :disabled="!authStatus?.uid"
          @click="useSignedInAccount"
        >
          <UserRound class="h-3.5 w-3.5" aria-hidden="true" />
          {{ l('当前账号', 'Signed-in account') }}
        </button>
        <button
          type="submit"
          class="flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-accent pl-3 pr-3.5 text-[11px] font-medium text-white transition-[background-color,scale] duration-150 ease-out hover:bg-accent-hover active:scale-[0.96] disabled:cursor-wait disabled:opacity-60"
          :disabled="busy"
        >
          <LoaderCircle v-if="busy" class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          <Play v-else class="h-3.5 w-3.5" aria-hidden="true" />
          {{ busy ? l('请求中…', 'Running…') : l('开始诊断', 'Run diagnostics') }}
        </button>
      </div>
      <p
        v-if="error"
        class="flex items-start gap-2 rounded-md border border-danger/20 bg-danger/8 px-3 py-2 text-[10px] leading-relaxed text-danger"
        role="alert"
      >
        <CircleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span class="text-pretty">{{ error }}</span>
      </p>
    </form>

    <div v-if="busy" class="space-y-2 border-t border-border pt-3" aria-live="polite">
      <div v-for="index in 4" :key="index" class="flex h-12 items-center gap-3 rounded-md bg-elevated/70 px-3">
        <span class="h-5 w-5 animate-pulse rounded bg-border/70" />
        <span class="h-2.5 flex-1 animate-pulse rounded-sm bg-border/70" />
        <span class="h-2.5 w-14 animate-pulse rounded-sm bg-border/70" />
      </div>
    </div>

    <div v-else-if="report" class="space-y-3 border-t border-border pt-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] tabular-nums text-fg-muted">
          <span class="inline-flex items-center gap-1"><CheckCircle2 class="h-3.5 w-3.5 text-success" />{{ successCount }}/{{ report.endpoints.length }}</span>
          <span v-if="failureCount" class="inline-flex items-center gap-1 text-danger"><CircleAlert class="h-3.5 w-3.5" />{{ failureCount }}</span>
          <span class="inline-flex items-center gap-1"><Clock3 class="h-3.5 w-3.5" />{{ totalDuration }} ms</span>
          <span>{{ report.season || '—' }} · {{ seasonSourceLabel() }}</span>
          <span>{{ l('绕过缓存', 'Cache bypassed') }}</span>
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="flex h-10 w-10 items-center justify-center rounded-md text-fg-muted transition-[background-color,color,scale] duration-150 hover:bg-elevated hover:text-accent active:scale-[0.96]"
            :title="l('复制完整报告', 'Copy full report')"
            :aria-label="l('复制完整报告', 'Copy full report')"
            @click="copyReport"
          >
            <Copy class="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="flex h-10 w-10 items-center justify-center rounded-md text-fg-muted transition-[background-color,color,scale] duration-150 hover:bg-elevated hover:text-danger active:scale-[0.96]"
            :title="l('清空结果', 'Clear results')"
            :aria-label="l('清空结果', 'Clear results')"
            @click="clearReport"
          >
            <X class="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div class="flex items-start gap-2 rounded-md border px-3 py-2 text-[10px] leading-relaxed" :class="diagnosisTone" role="status">
        <CheckCircle2 v-if="diagnosis === 'complete'" class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <CircleAlert v-else-if="diagnosis === 'overview-failed' || diagnosis === 'aggregate-invalid'" class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <AlertTriangle v-else class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span class="text-pretty">{{ diagnosisText() }}</span>
      </div>

      <div v-if="normalization.error" class="rounded-md bg-danger/8 px-3 py-2 font-mono text-[9px] leading-relaxed text-danger">
        {{ normalization.error }}
      </div>

      <section aria-labelledby="perfect-api-field-checks-title">
        <div class="mb-1.5 flex items-center justify-between">
          <h3 id="perfect-api-field-checks-title" class="text-[10px] font-medium text-fg-secondary">
            {{ l('前端关键字段', 'Frontend key fields') }}
          </h3>
          <span class="text-[9px] text-fg-muted">{{ report.targetSteamId }}</span>
        </div>
        <div class="grid grid-cols-3 overflow-hidden rounded-md border border-border sm:grid-cols-5">
          <div
            v-for="field in fieldChecks"
            :key="field.key"
            class="min-w-0 border-b border-r border-border bg-base px-2 py-2 last:border-r-0"
          >
            <div class="flex min-w-0 items-center gap-1 text-[9px] text-fg-muted">
              <Check v-if="field.available" class="h-3 w-3 shrink-0 text-success" aria-hidden="true" />
              <X v-else class="h-3 w-3 shrink-0 text-danger" aria-hidden="true" />
              <span class="truncate">{{ fieldLabel(field.key) }}</span>
            </div>
            <div class="mt-1 truncate text-[11px] font-medium tabular-nums" :class="field.available ? 'text-fg' : 'text-danger'">
              {{ field.value }}
            </div>
          </div>
        </div>
      </section>

      <section class="overflow-hidden rounded-md border border-border" aria-label="Perfect API endpoints">
        <article v-for="(endpoint, index) in report.endpoints" :key="endpoint.id" :class="index ? 'border-t border-border' : ''">
          <div class="flex min-h-12 items-center gap-2 bg-surface px-2">
            <button
              type="button"
              class="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left transition-[background-color,scale] duration-150 hover:bg-elevated active:scale-[0.96]"
              :aria-expanded="expandedEndpointIds.has(endpoint.id)"
              @click="toggleEndpoint(endpoint.id)"
            >
              <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-elevated text-fg-muted">
                <Database class="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[10px] font-medium text-fg-secondary">{{ endpointTitle(endpoint.id) }}</span>
                <span class="block truncate font-mono text-[9px] text-fg-muted">{{ endpoint.method }} · {{ endpoint.durationMs }} ms</span>
              </span>
              <span class="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium" :class="endpointStatusClass(endpoint)">
                <CheckCircle2 v-if="endpoint.status === 'success'" class="h-3 w-3" aria-hidden="true" />
                <CircleAlert v-else-if="endpoint.status === 'error'" class="h-3 w-3" aria-hidden="true" />
                <SkipForward v-else class="h-3 w-3" aria-hidden="true" />
                {{ endpointStatusLabel(endpoint) }}
              </span>
              <ChevronDown class="h-3.5 w-3.5 shrink-0 text-fg-muted transition-transform duration-150" :class="expandedEndpointIds.has(endpoint.id) ? 'rotate-180' : ''" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-fg-muted transition-[background-color,color,scale] duration-150 hover:bg-elevated hover:text-accent active:scale-[0.96]"
              :title="l('复制此接口数据', 'Copy this endpoint')"
              :aria-label="l(`复制${endpointTitle(endpoint.id)}数据`, `Copy ${endpointTitle(endpoint.id)} data`)"
              @click="copyEndpoint(endpoint)"
            >
              <Copy class="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div v-if="expandedEndpointIds.has(endpoint.id)" class="space-y-2 border-t border-border bg-base p-2.5">
            <div class="break-all font-mono text-[9px] leading-relaxed text-fg-muted">{{ endpoint.url }}</div>
            <div>
              <div class="mb-1 text-[9px] font-medium text-fg-muted">{{ l('脱敏请求', 'Redacted request') }}</div>
              <pre class="selectable max-h-32 overflow-auto rounded-md bg-surface p-2 font-mono text-[9px] leading-relaxed text-fg-secondary whitespace-pre-wrap break-all">{{ formatJson(endpoint.request) }}</pre>
            </div>
            <div>
              <div class="mb-1 text-[9px] font-medium text-fg-muted">{{ endpoint.status === 'success' ? l('解密响应', 'Decoded response') : l('错误', 'Error') }}</div>
              <pre class="selectable max-h-64 overflow-auto rounded-md bg-surface p-2 font-mono text-[9px] leading-relaxed whitespace-pre-wrap break-all" :class="endpoint.status === 'error' ? 'text-danger' : 'text-fg-secondary'">{{ endpoint.status === 'success' ? formatJson(endpoint.response) : endpoint.error }}</pre>
            </div>
          </div>
        </article>
      </section>

      <section class="overflow-hidden rounded-md border border-border">
        <button
          type="button"
          class="flex min-h-12 w-full items-center gap-2 px-3 text-left transition-[background-color,scale] duration-150 hover:bg-elevated active:scale-[0.96]"
          :aria-expanded="aggregateExpanded"
          @click="aggregateExpanded = !aggregateExpanded"
        >
          <Database class="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <span class="min-w-0 flex-1 text-[10px] font-medium text-fg-secondary">{{ l('生产聚合形态（无缓存）', 'Production aggregate shape (uncached)') }}</span>
          <ChevronDown class="h-3.5 w-3.5 text-fg-muted transition-transform duration-150" :class="aggregateExpanded ? 'rotate-180' : ''" aria-hidden="true" />
        </button>
        <pre v-if="aggregateExpanded" class="selectable max-h-72 overflow-auto border-t border-border bg-base p-3 font-mono text-[9px] leading-relaxed text-fg-secondary whitespace-pre-wrap break-all">{{ formatJson(report.aggregate) }}</pre>
      </section>
    </div>
  </div>
</template>
