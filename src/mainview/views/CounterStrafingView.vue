<script setup lang="ts">
import {
  Activity,
  Crosshair,
  Eye,
  EyeOff,
  Gauge,
  Keyboard,
  Play,
  RotateCcw,
  Square,
  Target,
  Zap,
} from 'lucide-vue-next';
import { computed } from 'vue';
import ShootingErrorBars from '../components/counter-strafing/ShootingErrorBars.vue';
import SettingsCard from '../components/settings/SettingsCard.vue';
import { useCounterStrafing } from '../composables/useCounterStrafing';
import type { BindingRole } from '@core/counter-strafing/types';
import {
  formatErrorValue,
  formatSampleKind,
  formatSpeedRatio,
  formatStopTiming,
  sampleStateColor,
} from '@core/counter-strafing/types';

defineProps<{
  visible?: boolean;
}>();

const {
  snapshot,
  settings,
  lastShot,
  busy,
  error,
  bindingRoles,
  bindingRoleLabels,
  toggleListening,
  toggleHud,
  clearRecords,
  patchNumberSetting,
  restoreMovementModelDefaults,
  beginCapture,
  cancelCapture,
  restoreDefaultKeyMap,
} = useCounterStrafing();

const statusLabel = computed(() => (snapshot.value.listening ? '监听中' : '未启动'));

const statusClass = computed(() =>
  snapshot.value.listening ? 'bg-success/10 text-success' : 'bg-muted text-fg-muted',
);

function bindingLabel(role: BindingRole): string {
  return settings.value.keyMap[role].label;
}

function isCapturing(role: BindingRole): boolean {
  return snapshot.value.capturingBinding === role;
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-base">
    <header class="border-b border-border bg-surface px-6 py-5">
      <div class="mx-auto flex max-w-3xl items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-2.5">
            <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Crosshair class="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h1 class="text-[18px] font-bold tracking-tight text-fg">急停训练</h1>
              <p class="mt-0.5 text-[11px] leading-relaxed text-fg-muted">基于 CS2 速度模型近似：反向急停、自然减速与 34% 准确阈值</p>
            </div>
          </div>
        </div>
        <span
          class="shrink-0 rounded-full px-3 py-1 text-[11px] font-medium"
          :class="statusClass"
        >
          {{ statusLabel }}
        </span>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto max-w-3xl space-y-5 px-6 py-6">
        <p v-if="error" class="rounded-xl border border-danger/20 bg-danger/5 px-3.5 py-2.5 text-[12px] text-danger">
          {{ error }}
        </p>

        <SettingsCard title="训练控制" description="启动采集并在游戏中开火练习" :icon="Play">
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
              {{ snapshot.listening ? '停止训练' : '开始训练' }}
            </button>
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
              @click="patchNumberSetting('hudLocked', !settings.hudLocked)"
            >
              <component :is="settings.hudLocked ? EyeOff : Eye" class="h-4 w-4" />
              {{ settings.hudLocked ? '解锁 HUD' : '锁定 HUD (鼠标穿透)' }}
            </button>
            <button
              type="button"
              class="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-[13px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
              :disabled="snapshot.shotRecords.length === 0"
              @click="clearRecords()"
            >
              <RotateCcw class="h-4 w-4" />
              清空记录
            </button>
          </div>
          <p v-if="snapshot.hudVisible" class="mt-3 text-[11px] leading-relaxed text-fg-muted">
            HUD 为全透明悬浮层：解锁状态下鼠标移入可拖动或缩放（右下角），位置会自动保存。锁定后鼠标将穿透 HUD。
          </p>
        </SettingsCard>

        <SettingsCard title="最近一枪" description="速度倍率与急停状态反馈" :icon="Target">
          <div class="flex min-h-[88px] flex-col items-center justify-center rounded-xl border border-border-subtle bg-elevated/60 px-4 py-6">
            <template v-if="lastShot">
              <p
                class="text-[28px] font-bold tabular-nums text-fg"
                :style="{ color: sampleStateColor(lastShot) }"
              >
                {{ formatSpeedRatio(lastShot) }}
              </p>
              <p class="mt-1 text-[13px] text-fg-secondary">{{ lastShot.scoreLabel }}</p>
              <p class="mt-0.5 text-[11px] text-fg-muted">
                {{ formatStopTiming(lastShot) }} · {{ formatSampleKind(lastShot) }} · 误差 {{ formatErrorValue(lastShot.error) }}
              </p>
              <p v-if="lastShot.crouchGraceActive" class="mt-0.5 text-[10px] text-cyan-400/90">
                蹲起宽限窗口内采样
              </p>
              <p v-else-if="lastShot.fireSampleDelayed" class="mt-0.5 text-[10px] text-fg-muted">
                首发延迟校准已应用
              </p>
              <p
                v-if="snapshot.fireActive"
                class="mt-1 text-[10px] font-medium text-accent"
              >
                按住开火 · 实时采样中
              </p>
            </template>
            <p v-else class="text-[13px] text-fg-muted">开始训练后，每次开火会在这里显示射击误差</p>
          </div>
        </SettingsCard>

        <SettingsCard title="射击误差历史" description="稳定度仪表条：横线为速度倍率阈值" :icon="Activity">
          <ShootingErrorBars :records="snapshot.shotRecords" :height="104" show-legend />
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

        <SettingsCard title="移速模型" description="调整加速度、急停制动与自然减速，修改后实时生效" :icon="Zap">
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

        <SettingsCard title="开火采样校准" description="对齐 CS2 射击判定，修改后实时生效" :icon="Target">
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

        <SettingsCard title="蹲起窗口" description="松蹲后的稳定宽限与误差恢复，修改后实时生效" :icon="Activity">
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

        <SettingsCard title="判定与显示" description="稳定判定阈值与历史记录，修改后实时生效" :icon="Gauge">
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
              <span class="text-[12px] font-medium text-fg-secondary">成功误差阈值</span>
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
          </div>
        </SettingsCard>
      </div>
    </div>
  </div>
</template>
