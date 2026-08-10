<script setup lang="ts">
import {
  ArrowDownUp,
  BarChart3,
  BookOpen,
  ChartColumn,
  Gauge,
  Keyboard,
  LayoutDashboard,
  LineChart,
  FolderOpen,
  Radio,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Target,
  Zap,
} from 'lucide-vue-next';
import { computed, nextTick, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { currentLocale, localize as l } from '../i18n';
import CounterStrafingConsole from '../components/counter-strafing/CounterStrafingConsole.vue';
import CounterStrafingDataPanel from '../components/counter-strafing/CounterStrafingDataPanel.vue';
import CounterStrafingDataGuide from '../components/counter-strafing/CounterStrafingDataGuide.vue';
import SettingsCard from '../components/settings/SettingsCard.vue';
import { useCounterStrafing } from '../composables/useCounterStrafing';
import { useGameBarWidget } from '../composables/useGameBarWidget';
import type { BindingRole } from '@core/counter-strafing/types';

const { t } = useI18n();

defineProps<{
  visible?: boolean;
}>();

type CounterStrafingTab = 'console' | 'data' | 'guide' | 'keys' | 'advanced';

const activeTab = ref<CounterStrafingTab>('console');

const navItems = computed(() => [
  { id: 'console' as const, label: t('counter.console'), icon: LayoutDashboard },
  { id: 'data' as const, label: t('counter.data'), icon: BarChart3 },
  { id: 'keys' as const, label: t('counter.keys'), icon: Keyboard },
  { id: 'advanced' as const, label: t('counter.advanced'), icon: SlidersHorizontal },
  { id: 'guide' as const, label: t('counter.guide'), icon: BookOpen },
]);

const contentDesc = computed<Record<CounterStrafingTab, string>>(() => ({
  console: t('counter.consoleDesc'), data: t('counter.dataDesc'), guide: t('counter.guideDesc'),
  keys: t('counter.keysDesc'), advanced: t('counter.advancedDesc'),
}));

const cs = useCounterStrafing();
const widget = useGameBarWidget({ autoInit: false });

const {
  snapshot,
  assessmentSnapshot,
  settings,
  gsiStatus,
  lastShot,
  lastAssessmentRecord,
  busy,
  error,
  inputListenNeedsAdmin,
  relaunchBusy,
  bindingRoles,
  bindingRoleLabels,
  patchNumberSetting,
  patchStatisticsHistoryLimit,
  restoreMovementModelDefaults,
  restoreAllDefaults,
  beginCapture,
  cancelCapture,
  restoreDefaultKeyMap,
  applySettings,
  setGsiEnhancementEnabled,
  repairGsiConfig,
  chooseGsiDirectory,
  openGsiConfigLocation,
  restartAsAdmin,
} = cs;

onMounted(() => {
  void Promise.all([widget.refreshStatus(), widget.refreshConnectionStatus()]);
  widget.ensureSessionUpdateCheck();
});

const activeMeta = computed(() => navItems.value.find((item) => item.id === activeTab.value)!);

function bindingLabel(role: BindingRole): string {
  const label = settings.value.keyMap[role].label;
  const mouseLabels: Record<string, string> = {
    鼠标左键: 'Mouse 1',
    鼠标右键: 'Mouse 2',
    鼠标中键: 'Mouse 3',
    鼠标侧键1: 'Mouse 4',
    鼠标侧键2: 'Mouse 5',
  };
  if (currentLocale() === 'en-US') {
    if (mouseLabels[label]) return mouseLabels[label];
    const match = label.match(/^鼠标键 (\d+)$/);
    if (match) return `Mouse ${Number(match[1]) + 1}`;
  }
  return label;
}

function isCapturing(role: BindingRole): boolean {
  return snapshot.value.capturingBinding === role;
}

function selectTab(tab: CounterStrafingTab) {
  activeTab.value = tab;
}

const compactNumberInputClass =
  'input-no-spin w-[4.75rem] shrink-0 rounded-lg border border-border bg-base px-2 py-1.5 text-right text-[13px] font-medium tabular-nums text-fg outline-none transition-[border-color,box-shadow] duration-200 focus:border-accent focus:ring-2 focus:ring-accent/15';

const settingValueColumnClass =
  'flex w-[8.25rem] shrink-0 items-center justify-end gap-1';

const settingUnitClass = 'w-5 shrink-0 text-right text-[11px] leading-none text-fg-muted';

const switchTrackClass =
  'relative inline-block h-6 w-11 shrink-0 rounded-full bg-slate-300 transition-colors duration-200 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-200 peer-checked:bg-accent peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 peer-disabled:opacity-60';

const gsiConfigurationFailed = computed(() =>
  settings.value.gsiEnhancementEnabled
  && ['notConfigured', 'portConflict', 'error'].includes(gsiStatus.value.connectionState),
);

const gsiFallbackText = computed(() => {
  if (gsiStatus.value.connectionState === 'portConflict') {
    return l('连接端口不可用，当前已使用基础记录。重新尝试后会自动更换端口。', 'The connection port is unavailable. Basic recording is active; retry to select another port.');
  }
  return l('自动配置未完成，当前已使用基础记录。可手动选择 CS2 目录继续配置。', 'Automatic setup did not finish. Basic recording is active; select the CS2 folder to continue.');
});

const tabContentShellRef = ref<HTMLElement | null>(null);
const tabShellMinHeight = ref<number | null>(null);

function tabContentMaxWidth(tab: CounterStrafingTab): 'max-w-2xl' | 'max-w-5xl' {
  return tab === 'data' ? 'max-w-5xl' : 'max-w-2xl';
}

const contentWidthClass = ref<'max-w-2xl' | 'max-w-5xl'>(tabContentMaxWidth(activeTab.value));

function lockTabShellHeight() {
  if (tabContentShellRef.value) {
    tabShellMinHeight.value = tabContentShellRef.value.offsetHeight;
  }
}

function syncTabShellHeight(el: Element) {
  void nextTick(() => {
    tabShellMinHeight.value = (el as HTMLElement).offsetHeight;
  });
}

function releaseTabShellHeight() {
  requestAnimationFrame(() => {
    tabShellMinHeight.value = null;
  });
}

function applyUpcomingTabWidth() {
  contentWidthClass.value = tabContentMaxWidth(activeTab.value);
}
</script>

<template>
  <div class="flex h-full min-h-0 bg-base">
    <aside
      class="flex w-55 shrink-0 flex-col border-r border-border bg-surface"
      :aria-label="t('counter.nav')"
    >
      <div class="border-b border-border px-4 py-4">
        <div class="flex items-center gap-2.5">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Gauge class="h-4 w-4" aria-hidden="true" />
          </div>
          <h1 class="text-[14px] font-semibold text-fg">{{ t('counter.title') }}</h1>
        </div>
      </div>

      <nav class="flex-1 space-y-1 overflow-y-auto p-3">
        <button
          v-for="item in navItems"
          :key="item.id"
          type="button"
          class="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-200"
          :class="
            activeTab === item.id
              ? 'bg-accent/10 text-accent'
              : 'text-fg-secondary hover:bg-elevated hover:text-fg'
          "
          :aria-current="activeTab === item.id ? 'page' : undefined"
          @click="selectTab(item.id)"
        >
          <component
            :is="item.icon"
            class="h-4 w-4 shrink-0"
            :class="activeTab === item.id ? 'text-accent' : 'text-fg-muted'"
            aria-hidden="true"
          />
          <span class="text-[13px] font-medium">{{ item.label }}</span>
        </button>
      </nav>

      <div class="shrink-0 border-t border-border bg-surface px-3 py-3">
        <button
          type="button"
          class="group flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-left shadow-sm transition-[background-color,border-color,transform,box-shadow] duration-200 hover:border-warning/35 hover:bg-warning/5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-surface disabled:hover:shadow-sm"
          :disabled="busy"
          @click="restoreAllDefaults()"
        >
          <span
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-elevated text-fg-muted transition-colors duration-200 group-hover:bg-warning/12 group-hover:text-warning group-disabled:bg-elevated group-disabled:text-fg-muted"
            aria-hidden="true"
          >
            <RotateCcw class="h-4 w-4" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-[13px] font-medium text-fg-secondary transition-colors duration-200 group-hover:text-fg">
              {{ t('counter.reset') }}
            </span>
            <span class="mt-0.5 block text-[11px] leading-snug text-fg-muted">
              {{ t('counter.resetDesc') }}
            </span>
          </span>
        </button>
      </div>
    </aside>

    <div class="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <header class="sticky top-0 z-10 border-b border-border bg-base/90 px-6 py-5 backdrop-blur-sm">
        <div>
          <h2 class="text-[18px] font-bold tracking-tight text-fg">{{ activeMeta.label }}</h2>
          <p class="mt-1 text-[13px] text-fg-muted">{{ contentDesc[activeTab] }}</p>
        </div>
      </header>

      <div
        class="cs-strafing-content-shell relative mx-auto px-6 py-6"
        :class="contentWidthClass"
      >
        <div
          v-if="error"
          class="mb-5 rounded-xl border px-3.5 py-3"
          :class="
            inputListenNeedsAdmin
              ? 'border-warning/30 bg-warning/5'
              : 'border-danger/20 bg-danger/5'
          "
        >
          <div class="flex items-start gap-2.5">
            <ShieldAlert
              class="mt-0.5 h-4 w-4 shrink-0"
              :class="inputListenNeedsAdmin ? 'text-warning' : 'text-danger'"
              aria-hidden="true"
            />
            <div class="min-w-0">
              <p
                class="text-[12px] leading-relaxed"
                :class="inputListenNeedsAdmin ? 'text-warning' : 'text-danger'"
              >
                {{ error }}
              </p>
              <ol
                v-if="inputListenNeedsAdmin"
                class="mt-3 list-decimal space-y-1.5 pl-4 text-[12px] leading-relaxed text-fg-secondary"
              >
                <li>{{ t('counter.restartSteps1') }}</li>
                <li>{{ t('counter.restartSteps2') }}</li>
                <li>{{ t('counter.restartSteps3') }}</li>
                <li>{{ t('counter.restartSteps4') }}</li>
              </ol>
              <button
                v-if="inputListenNeedsAdmin"
                type="button"
                class="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-2 text-[12px] font-medium text-warning hover:bg-warning/15 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="relaunchBusy"
                @click="restartAsAdmin()"
              >
                {{ relaunchBusy ? t('counter.restarting') : t('counter.restartAdmin') }}
              </button>
            </div>
          </div>
        </div>

        <div
          ref="tabContentShellRef"
          class="relative"
          :style="tabShellMinHeight != null ? { minHeight: `${tabShellMinHeight}px` } : undefined"
        >
        <Transition
          name="cs-strafing-tab"
          mode="out-in"
          @before-leave="lockTabShellHeight"
          @after-leave="applyUpcomingTabWidth"
          @before-enter="syncTabShellHeight"
          @after-enter="releaseTabShellHeight"
        >
          <CounterStrafingConsole
            v-if="activeTab === 'console'"
            key="console"
            :cs="cs"
            :widget="widget"
          />

          <CounterStrafingDataPanel
            v-else-if="activeTab === 'data'"
            key="data"
            :snapshot="snapshot"
            :assessment-snapshot="assessmentSnapshot"
            :last-shot="lastShot"
            :last-assessment-record="lastAssessmentRecord"
            :assessment-chart-type="settings.assessmentChartType"
            @update:assessment-chart-type="cs.applySettings({ assessmentChartType: $event })"
          />

          <CounterStrafingDataGuide v-else-if="activeTab === 'guide'" key="guide" />

          <!-- 键位 -->
          <div v-else-if="activeTab === 'keys'" key="keys" class="space-y-5">
            <SettingsCard :title="t('counter.keyMap')" :description="t('counter.keyMapDesc')" :icon="Keyboard">
              <div class="grid gap-3 sm:grid-cols-2">
                <button
                  v-for="role in bindingRoles"
                  :key="role"
                  type="button"
                  class="flex cursor-pointer items-center justify-between rounded-xl border px-3.5 py-3 text-left transition-colors duration-200"
                  :class="
                    isCapturing(role)
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border bg-surface text-fg-secondary hover:bg-elevated hover:text-fg'
                  "
                  :disabled="busy"
                  @click="isCapturing(role) ? cancelCapture() : beginCapture(role)"
                >
                  <span class="text-[12px] font-medium">{{ bindingRoleLabels[role] }}</span>
                  <span class="rounded-lg bg-elevated px-2 py-1 text-[12px] font-semibold tabular-nums text-fg">
                    {{ isCapturing(role) ? t('counter.pressKey') : bindingLabel(role) }}
                  </span>
                </button>
              </div>
              <button
                type="button"
                class="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-[12px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
                :disabled="busy"
                @click="restoreDefaultKeyMap()"
              >
                {{ t('counter.resetKeys') }}
              </button>
            </SettingsCard>
          </div>

          <!-- 高级设置 -->
          <div v-else key="advanced" class="space-y-5">
            <SettingsCard
              :title="l('过滤无效数据', 'Filter invalid data')"
              :description="l('通过 CS2 官方接口减少无效数据', 'Use the official CS2 interface to reduce invalid training records')"
              :icon="Radio"
            >
              <label class="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-2">
                <div class="min-w-0">
                  <p class="text-[13px] font-medium text-fg">
                    {{ l('过滤无效数据', 'Filter invalid data') }}
                  </p>
                  <p class="mt-0.5 text-pretty text-[11px] leading-relaxed text-fg-muted">
                    {{ l('自动识别游戏场景，让数据更准确', 'Recognize in-game context automatically for more accurate data') }}
                  </p>
                </div>
                <span class="relative inline-flex h-10 shrink-0 items-center">
                  <input
                    type="checkbox"
                    class="peer sr-only"
                    :checked="settings.gsiEnhancementEnabled"
                    :disabled="busy"
                    :aria-label="l('过滤无效数据', 'Filter invalid data')"
                    @change="setGsiEnhancementEnabled(($event.target as HTMLInputElement).checked)"
                  />
                  <span :class="switchTrackClass" aria-hidden="true" />
                </span>
              </label>

              <div v-if="settings.gsiEnhancementEnabled" class="mt-2 border-t border-border-subtle pt-2">
                <div class="flex min-w-0 items-center gap-2">
                  <span class="shrink-0 text-[10px] text-fg-muted">
                    {{ l('配置文件', 'Config file') }}
                  </span>
                  <button
                    type="button"
                    class="group flex min-h-10 min-w-0 flex-1 cursor-pointer items-center justify-end gap-1.5 rounded-lg px-1 text-right text-fg-muted transition-[background-color,color] duration-150 hover:bg-elevated/60 hover:text-fg-secondary active:bg-elevated"
                    :title="gsiStatus.configPath || l('手动选择 CS2 目录', 'Select the CS2 folder manually')"
                    :aria-label="gsiStatus.configPath ? l('打开 GSI 配置文件位置', 'Open the GSI config location') : l('手动选择 CS2 目录', 'Select the CS2 folder manually')"
                    @click="openGsiConfigLocation()"
                  >
                    <code class="truncate text-[10px] font-normal">
                      {{ gsiStatus.configPath || l('尚未生成，点击手动选择目录', 'Not created; select the folder manually') }}
                    </code>
                    <FolderOpen class="h-3.5 w-3.5 shrink-0 transition-colors duration-150 group-hover:text-accent" aria-hidden="true" />
                  </button>
                </div>

                <div
                  v-if="gsiConfigurationFailed"
                  class="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-500/7 px-3.5 py-3 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.16)]"
                  role="status"
                >
                  <div class="flex min-w-0 flex-1 items-start gap-2.5">
                    <ShieldAlert class="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                    <p class="min-w-0 text-pretty text-[11px] leading-relaxed text-fg-secondary">
                      {{ gsiFallbackText }}
                    </p>
                  </div>
                  <div class="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      class="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-surface px-3 text-[11px] font-medium text-fg-secondary shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_-1px_rgba(0,0,0,0.08)] transition-[background-color,color,box-shadow,transform] duration-150 hover:bg-elevated hover:text-fg hover:shadow-[0_0_0_1px_rgba(0,0,0,0.1),0_2px_4px_rgba(0,0,0,0.06)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
                      :disabled="busy"
                      @click="repairGsiConfig()"
                    >
                      <RotateCcw class="h-3.5 w-3.5" aria-hidden="true" />
                      {{ l('重新尝试', 'Retry') }}
                    </button>
                    <button
                      type="button"
                      class="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-fg-muted transition-[background-color,color,transform] duration-150 hover:bg-amber-500/10 hover:text-fg-secondary active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
                      :disabled="busy"
                      @click="chooseGsiDirectory()"
                    >
                      <FolderOpen class="h-3.5 w-3.5" aria-hidden="true" />
                      {{ l('选择目录', 'Select folder') }}
                    </button>
                  </div>
                </div>
              </div>
            </SettingsCard>

            <SettingsCard :title="t('counter.judgement')" :description="t('counter.judgementDesc')" :icon="SlidersHorizontal">
              <div class="space-y-4">
                <div
                  class="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-accent/20 bg-accent/4 px-4 py-3.5"
                >
                  <div class="flex min-w-0 items-start gap-3">
                    <div
                      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"
                    >
                      <Gauge class="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div class="min-w-0">
                      <p class="text-[13px] font-semibold text-fg">{{ t('counter.historyCount') }}</p>
                      <p class="mt-0.5 text-[11px] leading-relaxed text-fg-muted">
                        {{ t('counter.historyCountDesc') }}
                      </p>
                    </div>
                  </div>
                  <div :class="settingValueColumnClass">
                    <input
                      :value="settings.historyLimit"
                      type="number"
                      min="20"
                      max="500"
                      step="10"
                      :aria-label="t('counter.historyCount')"
                      :class="compactNumberInputClass"
                      @input="patchStatisticsHistoryLimit(($event.target as HTMLInputElement).value)"
                      @change="patchStatisticsHistoryLimit(($event.target as HTMLInputElement).value, 0)"
                    />
                    <span :class="settingUnitClass">{{ t('counter.recordsUnit') }}</span>
                  </div>
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                  <div class="overflow-hidden rounded-xl border border-border bg-elevated/25">
                    <div class="flex items-center gap-2.5 border-b border-border-subtle px-4 py-3">
                      <div
                        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"
                      >
                        <LineChart class="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div class="min-w-0 flex-1">
                        <p class="text-[13px] font-semibold text-fg">{{ t('counter.assessment') }}</p>
                        <p class="text-[11px] text-fg-muted">{{ t('counter.assessmentDesc') }}</p>
                      </div>
                    </div>
                    <div class="divide-y divide-border-subtle border-b border-border-subtle">
                      <label
                        class="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 transition-colors duration-200 hover:bg-elevated/40"
                      >
                        <span class="text-[12px] font-medium text-fg-secondary">
                          {{ t('counter.horizontal') }}
                          <span class="ml-1 font-normal text-fg-muted">A / D</span>
                        </span>
                        <span class="relative inline-flex shrink-0 items-center">
                          <input
                            type="checkbox"
                            class="peer sr-only"
                            :checked="settings.assessmentHorizontalEnabled"
                            :aria-label="`${t('counter.horizontal')} A / D`"
                            @change="
                              applySettings({
                                assessmentHorizontalEnabled: ($event.target as HTMLInputElement).checked,
                              })
                            "
                          />
                          <span :class="switchTrackClass" aria-hidden="true" />
                        </span>
                      </label>
                      <label
                        class="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 transition-colors duration-200 hover:bg-elevated/40"
                      >
                        <span class="text-[12px] font-medium text-fg-secondary">
                          {{ t('counter.vertical') }}
                          <span class="ml-1 font-normal text-fg-muted">W / S</span>
                        </span>
                        <span class="relative inline-flex shrink-0 items-center">
                          <input
                            type="checkbox"
                            class="peer sr-only"
                            :checked="settings.assessmentVerticalEnabled"
                            :aria-label="`${t('counter.vertical')} W / S`"
                            @change="
                              applySettings({
                                assessmentVerticalEnabled: ($event.target as HTMLInputElement).checked,
                              })
                            "
                          />
                          <span :class="switchTrackClass" aria-hidden="true" />
                        </span>
                      </label>
                    </div>
                    <div class="divide-y divide-border-subtle">
                      <label class="flex items-center justify-between gap-3 px-4 py-3">
                        <div class="flex min-w-0 items-center gap-2">
                          <span
                            class="h-2 w-2 shrink-0 rounded-full bg-violet-500"
                            aria-hidden="true"
                          />
                          <span class="text-[12px] font-medium text-fg-secondary">{{ t('counter.perfect') }}</span>
                        </div>
                        <div :class="settingValueColumnClass">
                          <span class="w-3 shrink-0 text-center text-[11px] text-fg-muted">≤</span>
                          <input
                            :value="settings.assessmentPerfectThresholdMs"
                            type="number"
                            min="0"
                            max="20"
                            step="0.5"
                            :aria-label="t('counter.perfect')"
                            :class="compactNumberInputClass"
                            @input="
                              patchNumberSetting('assessmentPerfectThresholdMs', ($event.target as HTMLInputElement).value)
                            "
                            @change="
                              patchNumberSetting('assessmentPerfectThresholdMs', ($event.target as HTMLInputElement).value, 0)
                            "
                          />
                          <span :class="settingUnitClass">ms</span>
                        </div>
                      </label>
                      <label class="flex items-center justify-between gap-3 px-4 py-3">
                        <div class="flex min-w-0 items-center gap-2">
                          <span
                            class="h-2 w-2 shrink-0 rounded-full bg-sky-500"
                            aria-hidden="true"
                          />
                          <span class="text-[12px] font-medium text-fg-secondary">{{ t('counter.good') }}</span>
                        </div>
                        <div :class="settingValueColumnClass">
                          <span class="w-3 shrink-0 text-center text-[11px] text-fg-muted">≤</span>
                          <input
                            :value="settings.assessmentSuccessThresholdMs"
                            type="number"
                            min="1"
                            max="50"
                            step="0.5"
                            :aria-label="t('counter.good')"
                            :class="compactNumberInputClass"
                            @input="
                              patchNumberSetting('assessmentSuccessThresholdMs', ($event.target as HTMLInputElement).value)
                            "
                            @change="
                              patchNumberSetting('assessmentSuccessThresholdMs', ($event.target as HTMLInputElement).value, 0)
                            "
                          />
                          <span :class="settingUnitClass">ms</span>
                        </div>
                      </label>
                      <label class="flex items-center justify-between gap-3 px-4 py-3">
                        <div class="flex min-w-0 items-center gap-2">
                          <span
                            class="h-2 w-2 shrink-0 rounded-full bg-amber-500"
                            aria-hidden="true"
                          />
                          <span class="text-[12px] font-medium text-fg-secondary">{{ t('counter.validWindow') }}</span>
                        </div>
                        <div :class="settingValueColumnClass">
                          <span class="w-3 shrink-0 text-center text-[11px] text-fg-muted">≤</span>
                          <input
                            :value="settings.assessmentMaxDiffMs"
                            type="number"
                            min="50"
                            max="500"
                            step="10"
                            :aria-label="t('counter.validWindow')"
                            :class="compactNumberInputClass"
                            @input="patchNumberSetting('assessmentMaxDiffMs', ($event.target as HTMLInputElement).value)"
                            @change="patchNumberSetting('assessmentMaxDiffMs', ($event.target as HTMLInputElement).value, 0)"
                          />
                          <span :class="settingUnitClass">ms</span>
                        </div>
                      </label>
                    </div>
                    <p class="border-t border-border-subtle px-4 py-2.5 text-[10px] leading-relaxed text-fg-muted">
                      {{ t('counter.assessmentHelp') }}
                    </p>
                  </div>

                  <div class="overflow-hidden rounded-xl border border-border bg-elevated/25">
                    <div class="flex items-center gap-2.5 border-b border-border-subtle px-4 py-3">
                      <div
                        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      >
                        <ChartColumn class="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div class="min-w-0">
                        <p class="text-[13px] font-semibold text-fg">{{ t('counter.shooting') }}</p>
                        <p class="text-[11px] text-fg-muted">{{ t('counter.shootingDesc') }}</p>
                      </div>
                    </div>
                    <div class="divide-y divide-border-subtle">
                      <label class="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
                        <span class="min-w-0 text-[12px] font-medium text-fg-secondary">{{ t('counter.lowSpeedWindow') }}</span>
                        <div :class="settingValueColumnClass">
                          <input
                            :value="settings.lowSpeedMovementWindowMs"
                            type="number"
                            min="60"
                            max="400"
                            step="10"
                            :aria-label="t('counter.lowSpeedWindow')"
                            :class="compactNumberInputClass"
                            @input="
                              patchNumberSetting('lowSpeedMovementWindowMs', ($event.target as HTMLInputElement).value)
                            "
                            @change="
                              patchNumberSetting('lowSpeedMovementWindowMs', ($event.target as HTMLInputElement).value, 0)
                            "
                          />
                          <span :class="settingUnitClass">ms</span>
                        </div>
                      </label>
                      <label class="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
                        <span class="min-w-0 text-[12px] font-medium text-fg-secondary">{{ t('counter.stableThreshold') }}</span>
                        <div :class="settingValueColumnClass">
                          <input
                            :value="settings.successErrorThreshold"
                            type="number"
                            min="0"
                            max="1"
                            step="0.05"
                            :aria-label="t('counter.stableThreshold')"
                            :class="compactNumberInputClass"
                            @input="
                              patchNumberSetting('successErrorThreshold', ($event.target as HTMLInputElement).value)
                            "
                            @change="
                              patchNumberSetting('successErrorThreshold', ($event.target as HTMLInputElement).value, 0)
                            "
                          />
                          <span :class="settingUnitClass" aria-hidden="true">&nbsp;</span>
                        </div>
                      </label>
                    </div>
                    <p class="border-t border-border-subtle px-4 py-2.5 text-[10px] leading-relaxed text-fg-muted">
                      {{ t('counter.shootingHelp') }}
                    </p>
                  </div>
                </div>
              </div>
            </SettingsCard>

            <SettingsCard :title="t('counter.movementModel')" :description="t('counter.movementModelDesc')" :icon="Zap">
              <div class="grid gap-4 sm:grid-cols-2">
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">{{ t('counter.maxSpeed') }}</span>
                  <input
                    :value="settings.maxMoveSpeed"
                    type="number"
                    min="0.5"
                    max="2"
                    step="0.05"
                    class="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13px] tabular-nums text-fg outline-none transition-colors duration-200 focus:border-accent"
                    @input="patchNumberSetting('maxMoveSpeed', ($event.target as HTMLInputElement).value)"
                    @change="patchNumberSetting('maxMoveSpeed', ($event.target as HTMLInputElement).value, 0)"
                  />
                  <span class="text-[10px] leading-relaxed text-fg-muted">
                    {{ t('counter.maxSpeedHelp') }}
                  </span>
                </label>
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">{{ t('counter.acceleration') }}</span>
                  <input
                    :value="settings.accelPerSec"
                    type="number"
                    min="1"
                    max="20"
                    step="0.5"
                    class="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13px] tabular-nums text-fg outline-none transition-colors duration-200 focus:border-accent"
                    @input="patchNumberSetting('accelPerSec', ($event.target as HTMLInputElement).value)"
                    @change="patchNumberSetting('accelPerSec', ($event.target as HTMLInputElement).value, 0)"
                  />
                  <span class="text-[10px] leading-relaxed text-fg-muted">
                    {{ t('counter.accelerationHelp') }}
                  </span>
                </label>
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">{{ t('counter.counterBrake') }}</span>
                  <input
                    :value="settings.counterStrafeAccelPerSec"
                    type="number"
                    min="5"
                    max="40"
                    step="0.5"
                    class="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13px] tabular-nums text-fg outline-none transition-colors duration-200 focus:border-accent"
                    @input="
                      patchNumberSetting('counterStrafeAccelPerSec', ($event.target as HTMLInputElement).value)
                    "
                    @change="
                      patchNumberSetting('counterStrafeAccelPerSec', ($event.target as HTMLInputElement).value, 0)
                    "
                  />
                  <span class="text-[10px] leading-relaxed text-fg-muted">
                    {{ t('counter.counterBrakeHelp') }}
                  </span>
                </label>
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">{{ t('counter.naturalDecel') }}</span>
                  <input
                    :value="settings.naturalDecelPerSec"
                    type="number"
                    min="0.5"
                    max="10"
                    step="0.5"
                    class="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13px] tabular-nums text-fg outline-none transition-colors duration-200 focus:border-accent"
                    @input="patchNumberSetting('naturalDecelPerSec', ($event.target as HTMLInputElement).value)"
                    @change="patchNumberSetting('naturalDecelPerSec', ($event.target as HTMLInputElement).value, 0)"
                  />
                  <span class="text-[10px] leading-relaxed text-fg-muted">
                    {{ t('counter.naturalDecelHelp') }}
                  </span>
                </label>
                <label class="block space-y-1.5 sm:col-span-2">
                  <span class="text-[12px] font-medium text-fg-secondary">{{ t('counter.accurateRatio') }}</span>
                  <input
                    :value="settings.cleanShotSpeedRatio"
                    type="number"
                    min="0.1"
                    max="1"
                    step="0.01"
                    class="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13px] tabular-nums text-fg outline-none transition-colors duration-200 focus:border-accent"
                    @input="
                      patchNumberSetting('cleanShotSpeedRatio', ($event.target as HTMLInputElement).value)
                    "
                    @change="
                      patchNumberSetting('cleanShotSpeedRatio', ($event.target as HTMLInputElement).value, 0)
                    "
                  />
                  <span class="text-[10px] leading-relaxed text-fg-muted">
                    {{ t('counter.accurateRatioHelp') }}
                  </span>
                </label>
              </div>
              <button
                type="button"
                class="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-[12px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
                :disabled="busy"
                @click="restoreMovementModelDefaults()"
              >
                <RotateCcw class="h-3.5 w-3.5" />
                {{ t('counter.resetMovement') }}
              </button>
            </SettingsCard>

            <SettingsCard :title="t('counter.fireSampling')" :description="t('counter.fireSamplingDesc')" :icon="Target">
              <div class="grid gap-4 sm:grid-cols-3">
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">{{ t('counter.firstShotDelay') }}</span>
                  <input
                    :value="settings.fireSampleDelayMs"
                    type="number"
                    min="0"
                    max="120"
                    step="1"
                    class="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13px] tabular-nums text-fg outline-none transition-colors duration-200 focus:border-accent"
                    @input="patchNumberSetting('fireSampleDelayMs', ($event.target as HTMLInputElement).value)"
                    @change="patchNumberSetting('fireSampleDelayMs', ($event.target as HTMLInputElement).value, 0)"
                  />
                  <span class="text-[10px] leading-relaxed text-fg-muted">
                    {{ t('counter.firstShotHelp') }}
                  </span>
                </label>
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">{{ t('counter.tapWindow') }}</span>
                  <input
                    :value="settings.tapMaxHoldMs"
                    type="number"
                    min="20"
                    max="300"
                    step="5"
                    class="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13px] tabular-nums text-fg outline-none transition-colors duration-200 focus:border-accent"
                    @input="patchNumberSetting('tapMaxHoldMs', ($event.target as HTMLInputElement).value)"
                    @change="patchNumberSetting('tapMaxHoldMs', ($event.target as HTMLInputElement).value, 0)"
                  />
                  <span class="text-[10px] leading-relaxed text-fg-muted">
                    {{ t('counter.tapHelp') }}
                  </span>
                </label>
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">{{ t('counter.autoFireInterval') }}</span>
                  <input
                    :value="settings.autoFireIntervalMs"
                    type="number"
                    min="40"
                    max="500"
                    step="10"
                    class="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13px] tabular-nums text-fg outline-none transition-colors duration-200 focus:border-accent"
                    @input="patchNumberSetting('autoFireIntervalMs', ($event.target as HTMLInputElement).value)"
                    @change="patchNumberSetting('autoFireIntervalMs', ($event.target as HTMLInputElement).value, 0)"
                  />
                  <span class="text-[10px] leading-relaxed text-fg-muted">
                    {{ t('counter.autoFireHelp') }}
                  </span>
                </label>
              </div>
            </SettingsCard>

            <SettingsCard :title="t('counter.crouchWindow')" :description="t('counter.crouchWindowDesc')" :icon="ArrowDownUp">
              <div class="grid gap-4 sm:grid-cols-2">
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">{{ t('counter.crouchGrace') }}</span>
                  <input
                    :value="settings.crouchReleaseGraceMs"
                    type="number"
                    min="0"
                    max="200"
                    step="5"
                    class="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13px] tabular-nums text-fg outline-none transition-colors duration-200 focus:border-accent"
                    @input="
                      patchNumberSetting('crouchReleaseGraceMs', ($event.target as HTMLInputElement).value)
                    "
                    @change="
                      patchNumberSetting('crouchReleaseGraceMs', ($event.target as HTMLInputElement).value, 0)
                    "
                  />
                  <span class="text-[10px] leading-relaxed text-fg-muted">
                    {{ t('counter.crouchGraceHelp') }}
                  </span>
                </label>
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">{{ t('counter.crouchRecovery') }}</span>
                  <input
                    :value="settings.crouchExitRampMs"
                    type="number"
                    min="0"
                    max="300"
                    step="5"
                    class="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13px] tabular-nums text-fg outline-none transition-colors duration-200 focus:border-accent"
                    @input="patchNumberSetting('crouchExitRampMs', ($event.target as HTMLInputElement).value)"
                    @change="patchNumberSetting('crouchExitRampMs', ($event.target as HTMLInputElement).value, 0)"
                  />
                  <span class="text-[10px] leading-relaxed text-fg-muted">
                    {{ t('counter.crouchRecoveryHelp') }}
                  </span>
                </label>
              </div>
            </SettingsCard>
          </div>
        </Transition>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cs-strafing-content-shell {
  transition: max-width 200ms ease-out;
}

.cs-strafing-tab-enter-active,
.cs-strafing-tab-leave-active {
  transition: opacity 160ms ease-out;
}

.cs-strafing-tab-enter-from,
.cs-strafing-tab-leave-to {
  opacity: 0;
}

</style>
