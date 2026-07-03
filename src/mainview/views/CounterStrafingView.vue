<script setup lang="ts">
import {
  BarChart3,
  BookOpen,
  Gauge,
  Keyboard,
  LayoutDashboard,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Target,
  Zap,
} from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import CounterStrafingConsole from '../components/counter-strafing/CounterStrafingConsole.vue';
import CounterStrafingDataPanel from '../components/counter-strafing/CounterStrafingDataPanel.vue';
import CounterStrafingDataGuide from '../components/counter-strafing/CounterStrafingDataGuide.vue';
import SettingsCard from '../components/settings/SettingsCard.vue';
import { useCounterStrafing } from '../composables/useCounterStrafing';
import { useGameBarWidget } from '../composables/useGameBarWidget';
import type { BindingRole } from '@core/counter-strafing/types';

defineProps<{
  visible?: boolean;
}>();

type CounterStrafingTab = 'console' | 'data' | 'guide' | 'keys' | 'advanced';

const activeTab = ref<CounterStrafingTab>('console');

const navItems = [
  { id: 'console' as const, label: '控制台', icon: LayoutDashboard },
  { id: 'data' as const, label: '数据', icon: BarChart3 },
  { id: 'keys' as const, label: '键位', icon: Keyboard },
  { id: 'advanced' as const, label: '高级设置', icon: SlidersHorizontal },
  { id: 'guide' as const, label: '说明', icon: BookOpen },
];

const contentDesc: Record<CounterStrafingTab, string> = {
  console: '选择显示模式、开启记录并完成准备',
  data: '查看急停和开枪的练习数据',
  guide: '开枪稳定与急停评估的功能说明与指标释义',
  keys: '自定义方向键、蹲键与开火键',
  advanced: '移速模型、采样校准与判定参数',
};

const cs = useCounterStrafing();
const widget = useGameBarWidget({ autoInit: false });

const {
  snapshot,
  assessmentSnapshot,
  settings,
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
  restartAsAdmin,
} = cs;

onMounted(() => {
  void widget.refreshStatus();
  widget.ensureSessionUpdateCheck();
});

const activeMeta = computed(() => navItems.find((item) => item.id === activeTab.value)!);

function bindingLabel(role: BindingRole): string {
  return settings.value.keyMap[role].label;
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
</script>

<template>
  <div class="flex h-full min-h-0 bg-base">
    <aside
      class="flex w-[220px] shrink-0 flex-col border-r border-border bg-surface"
      aria-label="急停助手导航"
    >
      <div class="border-b border-border px-4 py-4">
        <div class="flex items-center gap-2.5">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Gauge class="h-4 w-4" aria-hidden="true" />
          </div>
          <h1 class="text-[14px] font-semibold text-fg">急停助手</h1>
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
              恢复默认设置
            </span>
            <span class="mt-0.5 block text-[11px] leading-snug text-fg-muted">
              键位、悬浮窗与高级参数
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

      <div class="relative mx-auto max-w-2xl px-6 py-6">
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
                <li>完全退出 CS 匹配助手</li>
                <li>在桌面或开始菜单找到程序图标</li>
                <li>右键 → 以管理员身份运行</li>
                <li>返回急停助手，再次点击「开始记录」</li>
              </ol>
              <button
                v-if="inputListenNeedsAdmin"
                type="button"
                class="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-2 text-[12px] font-medium text-warning hover:bg-warning/15 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="relaunchBusy"
                @click="restartAsAdmin()"
              >
                {{ relaunchBusy ? '正在重启…' : '以管理员身份重启' }}
              </button>
            </div>
          </div>
        </div>

        <Transition name="settings-tab" mode="out-in">
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
          />

          <CounterStrafingDataGuide v-else-if="activeTab === 'guide'" key="guide" />

          <!-- 键位 -->
          <div v-else-if="activeTab === 'keys'" key="keys" class="space-y-5">
            <SettingsCard title="按键映射" description="方向键、蹲键、开火键均可自定义" :icon="Keyboard">
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
                    {{ isCapturing(role) ? '按下新键…' : bindingLabel(role) }}
                  </span>
                </button>
              </div>
              <button
                type="button"
                class="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-[12px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
                :disabled="busy"
                @click="restoreDefaultKeyMap()"
              >
                恢复默认 WASD / Ctrl / 鼠标左键
              </button>
            </SettingsCard>
          </div>

          <!-- 高级设置 -->
          <div v-else key="advanced" class="space-y-5">
            <SettingsCard title="判定与显示" description="调整稳定判定、急停评估与统计窗口" :icon="SlidersHorizontal">
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
                      <p class="text-[13px] font-semibold text-fg">统计数据条数</p>
                      <p class="mt-0.5 text-[11px] leading-relaxed text-fg-muted">
                        开枪柱状图与急停折线图共用，影响平均误差、稳定率、标准差等统计
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
                      aria-label="统计数据条数"
                      :class="compactNumberInputClass"
                      @input="patchStatisticsHistoryLimit(($event.target as HTMLInputElement).value)"
                      @change="patchStatisticsHistoryLimit(($event.target as HTMLInputElement).value, 0)"
                    />
                    <span :class="settingUnitClass">条</span>
                  </div>
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                  <div class="overflow-hidden rounded-xl border border-border bg-elevated/25">
                    <div class="flex items-center gap-2.5 border-b border-border-subtle px-4 py-3">
                      <div
                        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      >
                        <ChartColumn class="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div class="min-w-0">
                        <p class="text-[13px] font-semibold text-fg">开枪稳定</p>
                        <p class="text-[11px] text-fg-muted">速度达标与误差判定</p>
                      </div>
                    </div>
                    <div class="divide-y divide-border-subtle">
                      <label class="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
                        <span class="min-w-0 text-[12px] font-medium text-fg-secondary">起步低速窗口</span>
                        <div :class="settingValueColumnClass">
                          <input
                            :value="settings.lowSpeedMovementWindowMs"
                            type="number"
                            min="60"
                            max="400"
                            step="10"
                            aria-label="起步低速窗口"
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
                        <span class="min-w-0 text-[12px] font-medium text-fg-secondary">稳定误差阈值</span>
                        <div :class="settingValueColumnClass">
                          <input
                            :value="settings.successErrorThreshold"
                            type="number"
                            min="0"
                            max="1"
                            step="0.05"
                            aria-label="稳定误差阈值"
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
                      低速窗口默认 180ms；误差阈值默认 0.35，越低越难判绿
                    </p>
                  </div>

                  <div class="overflow-hidden rounded-xl border border-border bg-elevated/25">
                    <div class="flex items-center gap-2.5 border-b border-border-subtle px-4 py-3">
                      <div
                        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"
                      >
                        <LineChart class="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div class="min-w-0 flex-1">
                        <p class="text-[13px] font-semibold text-fg">急停评估</p>
                        <p class="text-[11px] text-fg-muted">反向切换时机与分级</p>
                      </div>
                    </div>
                    <div class="divide-y divide-border-subtle border-b border-border-subtle">
                      <label
                        class="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 transition-colors duration-200 hover:bg-elevated/40"
                      >
                        <span class="text-[12px] font-medium text-fg-secondary">
                          横向急停
                          <span class="ml-1 font-normal text-fg-muted">A / D</span>
                        </span>
                        <span class="relative inline-flex shrink-0 items-center">
                          <input
                            type="checkbox"
                            class="peer sr-only"
                            :checked="settings.assessmentHorizontalEnabled"
                            aria-label="横向急停 A / D"
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
                          纵向急停
                          <span class="ml-1 font-normal text-fg-muted">W / S</span>
                        </span>
                        <span class="relative inline-flex shrink-0 items-center">
                          <input
                            type="checkbox"
                            class="peer sr-only"
                            :checked="settings.assessmentVerticalEnabled"
                            aria-label="纵向急停 W / S"
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
                          <span class="text-[12px] font-medium text-fg-secondary">完美</span>
                        </div>
                        <div :class="settingValueColumnClass">
                          <span class="w-3 shrink-0 text-center text-[11px] text-fg-muted">≤</span>
                          <input
                            :value="settings.assessmentPerfectThresholdMs"
                            type="number"
                            min="0"
                            max="20"
                            step="0.5"
                            aria-label="完美阈值"
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
                          <span class="text-[12px] font-medium text-fg-secondary">优秀</span>
                        </div>
                        <div :class="settingValueColumnClass">
                          <span class="w-3 shrink-0 text-center text-[11px] text-fg-muted">≤</span>
                          <input
                            :value="settings.assessmentSuccessThresholdMs"
                            type="number"
                            min="1"
                            max="50"
                            step="0.5"
                            aria-label="优秀阈值"
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
                          <span class="text-[12px] font-medium text-fg-secondary">有效窗口</span>
                        </div>
                        <div :class="settingValueColumnClass">
                          <span class="w-3 shrink-0 text-center text-[11px] text-fg-muted">≤</span>
                          <input
                            :value="settings.assessmentMaxDiffMs"
                            type="number"
                            min="50"
                            max="500"
                            step="10"
                            aria-label="有效切换窗口"
                            :class="compactNumberInputClass"
                            @input="patchNumberSetting('assessmentMaxDiffMs', ($event.target as HTMLInputElement).value)"
                            @change="patchNumberSetting('assessmentMaxDiffMs', ($event.target as HTMLInputElement).value, 0)"
                          />
                          <span :class="settingUnitClass">ms</span>
                        </div>
                      </label>
                    </div>
                    <p class="border-t border-border-subtle px-4 py-2.5 text-[10px] leading-relaxed text-fg-muted">
                      偏差分级自上而下收紧；超出有效窗口的切换不计入评估
                    </p>
                  </div>
                </div>
              </div>
            </SettingsCard>

            <SettingsCard title="移速模型" description="调整加速度、急停制动与自然减速" :icon="Zap">
              <div class="grid gap-4 sm:grid-cols-2">
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">最大移速</span>
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
                    默认 1.0。人物最快能跑多快。整体偏大时，模型会觉得你跑得更快，更容易出现红柱。
                  </span>
                </label>
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">起步加速度 (/s)</span>
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
                    默认 5.5。按住方向键后，速度多快能加上去。偏大=刚起步就容易被判在动；偏小=起步偏慢，容易偏绿。
                  </span>
                </label>
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">急停制动 (/s)</span>
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
                    默认 14。按反向键时，速度多快能刹到 0。AD 急停主要靠它；偏大=停得更狠、更容易绿；偏小=刹不住、容易红。
                  </span>
                </label>
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">自然减速 (/s)</span>
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
                    默认 2.5。松开方向键后，惯性滑行多快能停下来。偏小=松键后还在滑，容易红。
                  </span>
                </label>
                <label class="block space-y-1.5 sm:col-span-2">
                  <span class="text-[12px] font-medium text-fg-secondary">准确速度比例</span>
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
                    默认 0.34（CS2 约 34% 满速可准）。速度低于「最大移速 × 该比例」就算准。偏大=更宽松、容易绿；偏小=更严格、容易红。
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
                恢复移速模型默认值
              </button>
            </SettingsCard>

            <SettingsCard title="开火采样校准" description="对齐 CS2 射击判定" :icon="Target">
              <div class="grid gap-4 sm:grid-cols-3">
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">首发延迟 (ms)</span>
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
                    默认 18ms。按下鼠标后，过这么久才去量速度。软件比游戏判得早→加大；判得晚→减小。
                  </span>
                </label>
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">短按窗口 (ms)</span>
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
                    默认 90ms。点射按住不超过这么久，只记一发。偏短=连点各算一发；偏长=长按才开始连发采样。
                  </span>
                </label>
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">连发间隔 (ms)</span>
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
                    默认 100ms。按住连发时，每隔多久记一根柱子。只影响连发记录频率，不影响单点判定。
                  </span>
                </label>
              </div>
            </SettingsCard>

            <SettingsCard title="蹲起窗口" description="松蹲后的稳定宽限与误差恢复" :icon="ArrowDownUp">
              <div class="grid gap-4 sm:grid-cols-2">
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">蹲起宽限 (ms)</span>
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
                    默认 45ms。松蹲后这段时间内开枪，仍按稳定算。蹲起打法可酌情调大。
                  </span>
                </label>
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">蹲起恢复 (ms)</span>
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
                    默认 90ms。蹲起宽限过后，误差慢慢恢复正常的过渡时间。偏长=蹲后更久仍偏宽容。
                  </span>
                </label>
              </div>
            </SettingsCard>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>
