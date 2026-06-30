<script setup lang="ts">
import {
  Activity,
  Eye,
  EyeOff,
  Gauge,
  Keyboard,
  LayoutDashboard,
  LayoutPanelTop,
  LineChart,
  Lock,
  LockOpen,
  Play,
  RotateCcw,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Square,
  Target,
  Zap,
} from 'lucide-vue-next';
import { computed, ref } from 'vue';
import CounterStrafingLineChart from '../components/counter-strafing/CounterStrafingLineChart.vue';
import ShootingErrorBars from '../components/counter-strafing/ShootingErrorBars.vue';
import SettingsCard from '../components/settings/SettingsCard.vue';
import SettingsToggle from '../components/settings/SettingsToggle.vue';
import { useCounterStrafing } from '../composables/useCounterStrafing';
import type { BindingRole } from '@core/counter-strafing/types';
import {
  formatDiffMs,
  formatErrorValue,
  formatSpeedRatio,
  sampleStateColor,
  shotFeedback,
  assessmentRecordColor,
} from '@core/counter-strafing/types';

defineProps<{
  visible?: boolean;
}>();

type CounterStrafingTab = 'overview' | 'hud' | 'keys' | 'advanced';

const activeTab = ref<CounterStrafingTab>('overview');

const navItems = [
  { id: 'overview' as const, label: '总览', icon: LayoutDashboard },
  { id: 'hud' as const, label: 'HUD 显示', icon: LayoutPanelTop },
  { id: 'keys' as const, label: '键位', icon: Keyboard },
  { id: 'advanced' as const, label: '高级设置', icon: SlidersHorizontal },
];

const contentDesc: Record<CounterStrafingTab, string> = {
  overview: '开始记录、查看核心反馈',
  hud: '管理游戏内悬浮 HUD 的显示与锁定',
  keys: '自定义方向键、蹲键与开火键',
  advanced: '移速模型、采样校准与判定参数',
};

const {
  snapshot,
  assessmentSnapshot,
  settings,
  lastShot,
  lastAssessmentRecord,
  busy,
  error,
  inputListenNeedsAdmin,
  bindingRoles,
  bindingRoleLabels,
  toggleListening,
  toggleHud,
  toggleAssessmentHud,
  clearAllRecords,
  patchNumberSetting,
  restoreMovementModelDefaults,
  restoreAllDefaults,
  beginCapture,
  cancelCapture,
  restoreDefaultKeyMap,
  applySettings,
} = useCounterStrafing();

const activeMeta = computed(() => navItems.find((item) => item.id === activeTab.value)!);

const hasAnyRecords = computed(
  () => assessmentSnapshot.value.records.length > 0 || snapshot.value.shotRecords.length > 0,
);

const lastShotFeedback = computed(() =>
  lastShot.value ? shotFeedback(lastShot.value) : null,
);

const assessmentDiffExtremes = computed(() => {
  const records = assessmentSnapshot.value.records;
  if (!records.length) return { min: null as number | null, max: null as number | null };
  let min = records[0].diffMs;
  let max = records[0].diffMs;
  for (const record of records) {
    if (record.diffMs < min) min = record.diffMs;
    if (record.diffMs > max) max = record.diffMs;
  }
  return { min, max };
});

function bindingLabel(role: BindingRole): string {
  return settings.value.keyMap[role].label;
}

function isCapturing(role: BindingRole): boolean {
  return snapshot.value.capturingBinding === role;
}

function selectTab(tab: CounterStrafingTab) {
  activeTab.value = tab;
}
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
    </aside>

    <div class="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <header class="sticky top-0 z-10 border-b border-border bg-base/90 px-6 py-5 backdrop-blur-sm">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-[18px] font-bold tracking-tight text-fg">{{ activeMeta.label }}</h2>
            <p class="mt-1 text-[13px] text-fg-muted">{{ contentDesc[activeTab] }}</p>
          </div>
          <button
            v-if="activeTab === 'advanced'"
            type="button"
            class="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="busy"
            @click="restoreAllDefaults()"
          >
            <RotateCcw class="h-3.5 w-3.5" aria-hidden="true" />
            恢复默认
          </button>
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
            </div>
          </div>
        </div>

        <Transition name="settings-tab" mode="out-in">
          <!-- 总览 -->
          <div v-if="activeTab === 'overview'" key="overview" class="space-y-5">
            <SettingsCard title="HUD 控制" description="开启后同时采集急停评估与开枪稳定性" :icon="Play">
              <div class="flex flex-wrap gap-3">
                <button
                  type="button"
                  class="inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-colors duration-200"
                  :class="
                    snapshot.listening
                      ? 'bg-danger/10 text-danger hover:bg-danger/15'
                      : 'bg-accent text-white hover:bg-accent-hover'
                  "
                  :disabled="busy"
                  @click="toggleListening()"
                >
                  <component :is="snapshot.listening ? Square : Play" class="h-4 w-4" />
                  {{ snapshot.listening ? '停止记录' : '开始记录' }}
                </button>
                <button
                  type="button"
                  class="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-[13px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="busy || !hasAnyRecords"
                  @click="clearAllRecords()"
                >
                  <RotateCcw class="h-4 w-4" />
                  清除输入
                </button>
              </div>
            </SettingsCard>

            <SettingsCard title="急停评估" description="AD / WS 反向切换时机" :icon="LineChart">
              <div
                class="flex min-h-[72px] flex-col items-center justify-center rounded-xl border border-border-subtle bg-elevated/60 px-4 py-5"
              >
                <template v-if="lastAssessmentRecord">
                  <p
                    class="text-[28px] font-bold tabular-nums"
                    :style="{ color: assessmentRecordColor(lastAssessmentRecord) }"
                  >
                    {{ formatDiffMs(lastAssessmentRecord.diffMs) }}
                  </p>
                  <p class="mt-1 text-[13px] text-fg-secondary">
                    {{ lastAssessmentRecord.fromKey }} → {{ lastAssessmentRecord.toKey }} ·
                    {{ lastAssessmentRecord.timingLabel }}
                  </p>
                </template>
                <p v-else class="text-[13px] text-fg-muted">开始记录后，反向切换会在这里显示评估结果</p>
              </div>
              <CounterStrafingLineChart
                :records="assessmentSnapshot.records"
                :max-points="32"
                :height="104"
                colored
                class="mt-4"
              />
              <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div class="rounded-xl border border-border bg-surface px-3 py-2.5">
                  <p class="text-[10px] font-medium uppercase tracking-wide text-fg-muted">平均偏差</p>
                  <p class="mt-1 text-[18px] font-bold tabular-nums text-fg">
                    {{ formatDiffMs(assessmentSnapshot.avgDiffMs) }}
                  </p>
                </div>
                <div class="rounded-xl border border-border bg-surface px-3 py-2.5">
                  <p class="text-[10px] font-medium uppercase tracking-wide text-fg-muted">优秀率</p>
                  <p class="mt-1 text-[18px] font-bold tabular-nums text-fg">
                    {{ assessmentSnapshot.successRate.toFixed(1) }}<span class="text-[12px] font-medium text-fg-muted">%</span>
                  </p>
                </div>
                <div class="rounded-xl border border-border bg-surface px-3 py-2.5">
                  <p class="text-[10px] font-medium uppercase tracking-wide text-fg-muted">标准差</p>
                  <p class="mt-1 text-[18px] font-bold tabular-nums text-fg">
                    {{ assessmentSnapshot.stdDevMs.toFixed(1) }}<span class="text-[12px] font-medium text-fg-muted">ms</span>
                  </p>
                </div>
                <div class="rounded-xl border border-border bg-surface px-3 py-2.5">
                  <p class="text-[10px] font-medium uppercase tracking-wide text-fg-muted">最小值</p>
                  <p class="mt-1 text-[18px] font-bold tabular-nums text-fg">
                    {{ assessmentDiffExtremes.min !== null ? formatDiffMs(assessmentDiffExtremes.min) : '—' }}
                  </p>
                </div>
                <div class="rounded-xl border border-border bg-surface px-3 py-2.5">
                  <p class="text-[10px] font-medium uppercase tracking-wide text-fg-muted">最大值</p>
                  <p class="mt-1 text-[18px] font-bold tabular-nums text-fg">
                    {{ assessmentDiffExtremes.max !== null ? formatDiffMs(assessmentDiffExtremes.max) : '—' }}
                  </p>
                </div>
                <div class="rounded-xl border border-border bg-surface px-3 py-2.5">
                  <p class="text-[10px] font-medium uppercase tracking-wide text-fg-muted">整体倾向</p>
                  <p class="mt-1 text-[15px] font-semibold text-fg">{{ assessmentSnapshot.tendencyLabel }}</p>
                </div>
              </div>
            </SettingsCard>

            <SettingsCard title="开枪稳定" description="速度倍率与稳定余量/误差反馈" :icon="Target">
              <div
                v-if="lastShot && lastShotFeedback"
                class="mb-4 flex min-h-[56px] flex-col items-center justify-center rounded-xl border border-border-subtle bg-elevated/60 px-4 py-4"
              >
                <p
                  class="text-[24px] font-bold tabular-nums text-fg"
                  :style="{ color: sampleStateColor(lastShot) }"
                >
                  {{ formatSpeedRatio(lastShot) }}
                </p>
                <p
                  class="mt-1 font-mono text-[15px] font-semibold tabular-nums"
                  :style="{ color: lastShotFeedback.color }"
                >
                  {{ lastShotFeedback.shortLabel }}
                </p>
              </div>
              <ShootingErrorBars :records="snapshot.shotRecords" :height="104" show-legend show-hud-feedback />
              <div class="mt-4 grid grid-cols-3 gap-3">
                <div class="rounded-xl border border-border bg-surface px-3 py-2.5">
                  <p class="text-[10px] font-medium uppercase tracking-wide text-fg-muted">平均误差</p>
                  <p class="mt-1 text-[18px] font-bold tabular-nums text-fg">
                    {{ formatErrorValue(snapshot.avgError) }}
                  </p>
                </div>
                <div class="rounded-xl border border-border bg-surface px-3 py-2.5">
                  <p class="text-[10px] font-medium uppercase tracking-wide text-fg-muted">稳定率</p>
                  <p class="mt-1 text-[18px] font-bold tabular-nums text-fg">
                    {{ snapshot.stableRate.toFixed(1) }}<span class="text-[12px] font-medium text-fg-muted">%</span>
                  </p>
                </div>
                <div class="rounded-xl border border-border bg-surface px-3 py-2.5">
                  <p class="text-[10px] font-medium uppercase tracking-wide text-fg-muted">最近状态</p>
                  <p class="mt-1 text-[15px] font-semibold text-fg">{{ lastShot?.scoreLabel ?? '—' }}</p>
                </div>
              </div>
            </SettingsCard>
          </div>

          <!-- HUD 显示 -->
          <div v-else-if="activeTab === 'hud'" key="hud" class="space-y-5">
            <SettingsCard title="急停评估 HUD" description="折线图：急停时机与历史趋势" :icon="LineChart">
              <div class="flex flex-wrap gap-3">
                <button
                  type="button"
                  class="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-[13px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
                  :disabled="busy"
                  @click="toggleAssessmentHud()"
                >
                  <component :is="assessmentSnapshot.hudVisible ? EyeOff : Eye" class="h-4 w-4" />
                  {{ assessmentSnapshot.hudVisible ? '隐藏 HUD' : '显示 HUD' }}
                </button>
                <button
                  type="button"
                  class="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-[13px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
                  :disabled="busy"
                  @click="applySettings({ assessmentHudLocked: !settings.assessmentHudLocked })"
                >
                  <component :is="settings.assessmentHudLocked ? LockOpen : Lock" class="h-4 w-4" />
                  {{ settings.assessmentHudLocked ? '解锁' : '锁定' }}
                </button>
              </div>
              <p class="mt-3 text-[11px] text-fg-muted">
                当前状态：{{ assessmentSnapshot.hudVisible ? '已显示' : '已隐藏' }} ·
                {{ settings.assessmentHudLocked ? '已锁定' : '未锁定' }}
              </p>
            </SettingsCard>

            <SettingsCard title="开枪稳定 HUD" description="柱状图：开枪稳定性与误差历史" :icon="Activity">
              <div class="flex flex-wrap gap-3">
                <button
                  type="button"
                  class="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-[13px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
                  :disabled="busy"
                  @click="toggleHud()"
                >
                  <component :is="snapshot.hudVisible ? EyeOff : Eye" class="h-4 w-4" />
                  {{ snapshot.hudVisible ? '隐藏 HUD' : '显示 HUD' }}
                </button>
                <button
                  type="button"
                  class="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-[13px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
                  :disabled="busy"
                  @click="applySettings({ hudLocked: !settings.hudLocked })"
                >
                  <component :is="settings.hudLocked ? LockOpen : Lock" class="h-4 w-4" />
                  {{ settings.hudLocked ? '解锁' : '锁定' }}
                </button>
              </div>
              <p class="mt-3 text-[11px] text-fg-muted">
                当前状态：{{ snapshot.hudVisible ? '已显示' : '已隐藏' }} ·
                {{ settings.hudLocked ? '已锁定' : '未锁定' }}
              </p>
              <SettingsToggle
                class="mt-4"
                :model-value="settings.hudShowStableBars"
                label="显示绿色稳定柱"
                description="关闭后稳定射击保留时间轴空位，仅黄/红失误高亮"
                @update:model-value="applySettings({ hudShowStableBars: $event })"
              />
            </SettingsCard>

            <p class="text-[11px] leading-relaxed text-fg-muted">
              两个 HUD 可同时显示。仅右下角手柄可拖动，锁定后鼠标穿透。
            </p>
          </div>

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

            <SettingsCard title="蹲起窗口" description="松蹲后的稳定宽限与误差恢复" :icon="Activity">
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

            <SettingsCard title="判定与显示" description="稳定判定阈值、历史记录与急停评估参数" :icon="Settings2">
              <div class="grid gap-4 sm:grid-cols-2">
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">起步低速窗口 (ms)</span>
                  <input
                    :value="settings.lowSpeedMovementWindowMs"
                    type="number"
                    min="60"
                    max="400"
                    step="10"
                    class="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13px] tabular-nums text-fg outline-none transition-colors duration-200 focus:border-accent"
                    @input="
                      patchNumberSetting('lowSpeedMovementWindowMs', ($event.target as HTMLInputElement).value)
                    "
                    @change="
                      patchNumberSetting('lowSpeedMovementWindowMs', ($event.target as HTMLInputElement).value, 0)
                    "
                  />
                  <span class="text-[10px] leading-relaxed text-fg-muted">
                    默认 180ms。刚起步或 AD 小摆时，低速开枪的解释窗口。偏大=这类情况更容易绿；偏小=更严格。
                  </span>
                </label>
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">稳定误差阈值</span>
                  <input
                    :value="settings.successErrorThreshold"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    class="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13px] tabular-nums text-fg outline-none transition-colors duration-200 focus:border-accent"
                    @input="
                      patchNumberSetting('successErrorThreshold', ($event.target as HTMLInputElement).value)
                    "
                    @change="
                      patchNumberSetting('successErrorThreshold', ($event.target as HTMLInputElement).value, 0)
                    "
                  />
                  <span class="text-[10px] leading-relaxed text-fg-muted">
                    默认 0.35。速度达标后，误差还要低于这个值才算稳定。偏低=更难绿；偏高=微动也可能算稳定。
                  </span>
                </label>
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">历史记录条数</span>
                  <input
                    :value="settings.historyLimit"
                    type="number"
                    min="20"
                    max="500"
                    step="10"
                    class="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13px] tabular-nums text-fg outline-none transition-colors duration-200 focus:border-accent"
                    @input="patchNumberSetting('historyLimit', ($event.target as HTMLInputElement).value)"
                    @change="patchNumberSetting('historyLimit', ($event.target as HTMLInputElement).value, 0)"
                  />
                  <span class="text-[10px] leading-relaxed text-fg-muted">
                    默认 100 条。仪表条和统计保留最近多少次射击。只影响显示，不影响判定。
                  </span>
                </label>
                <SettingsToggle
                  :model-value="settings.assessmentHorizontalEnabled"
                  label="横向急停 (A/D)"
                  description="记录左右反向切换"
                  @update:model-value="applySettings({ assessmentHorizontalEnabled: $event })"
                />
                <SettingsToggle
                  :model-value="settings.assessmentVerticalEnabled"
                  label="纵向急停 (W/S)"
                  description="记录前后反向切换"
                  @update:model-value="applySettings({ assessmentVerticalEnabled: $event })"
                />
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">完美阈值 (ms)</span>
                  <input
                    :value="settings.assessmentPerfectThresholdMs"
                    type="number"
                    min="0"
                    max="20"
                    step="0.5"
                    class="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13px] tabular-nums text-fg outline-none transition-colors duration-200 focus:border-accent"
                    @input="patchNumberSetting('assessmentPerfectThresholdMs', ($event.target as HTMLInputElement).value)"
                    @change="patchNumberSetting('assessmentPerfectThresholdMs', ($event.target as HTMLInputElement).value, 0)"
                  />
                </label>
                <label class="block space-y-1.5">
                  <span class="text-[12px] font-medium text-fg-secondary">优秀阈值 (ms)</span>
                  <input
                    :value="settings.assessmentSuccessThresholdMs"
                    type="number"
                    min="1"
                    max="50"
                    step="0.5"
                    class="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13px] tabular-nums text-fg outline-none transition-colors duration-200 focus:border-accent"
                    @input="patchNumberSetting('assessmentSuccessThresholdMs', ($event.target as HTMLInputElement).value)"
                    @change="patchNumberSetting('assessmentSuccessThresholdMs', ($event.target as HTMLInputElement).value, 0)"
                  />
                </label>
              </div>
            </SettingsCard>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>
