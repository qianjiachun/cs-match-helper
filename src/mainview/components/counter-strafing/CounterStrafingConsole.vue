<script setup lang="ts">
import {
  AlertCircle,
  AppWindow,
  Check,
  ExternalLink,
  LayoutPanelTop,
  ListChecks,
  Monitor,
  Loader2,
  Play,
  Power,
  RotateCcw,
  Square,
} from 'lucide-vue-next';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import CounterStrafingHudSettings from './CounterStrafingHudSettings.vue';
import GameBarWidgetDisplaySettings from './GameBarWidgetDisplaySettings.vue';
import GameBarWidgetInstallSection from '../gamebar-widget/GameBarWidgetInstallSection.vue';
import GameBarShortcutKbd from '../gamebar-widget/GameBarShortcutKbd.vue';
import { DEFAULT_GAME_BAR_OPEN_SHORTCUT } from '@core/gamebar-widget/shortcut';
import { openExternalUrl } from '../../native';
import { showToast } from '../../composables/useCopyFeedback';
import {
  useCounterStrafingDisplayMode,
  type CounterStrafingDisplayMode,
} from '../../composables/useCounterStrafingDisplayMode';
import type { useCounterStrafing } from '../../composables/useCounterStrafing';
import type { useGameBarWidget } from '../../composables/useGameBarWidget';

const props = defineProps<{
  cs: ReturnType<typeof useCounterStrafing>;
  widget: ReturnType<typeof useGameBarWidget>;
}>();

const { displayMode, setDisplayMode } = useCounterStrafingDisplayMode();
const widgetInstallSectionRef = ref<InstanceType<typeof GameBarWidgetInstallSection> | null>(null);

const snapshot = props.cs.snapshot;
const busy = props.cs.busy;
const hasAnyRecords = computed(
  () =>
    props.cs.assessmentSnapshot.value.records.length > 0 ||
    snapshot.value.shotRecords.length > 0,
);

const recordSessionSummary = computed(() => {
  const assessmentCount = props.cs.assessmentSnapshot.value.records.length;
  const shotCount = snapshot.value.shotRecords.length;
  if (!assessmentCount && !shotCount) return null;
  const parts: string[] = [];
  if (assessmentCount) parts.push(`${assessmentCount} 次急停`);
  if (shotCount) parts.push(`${shotCount} 次开枪`);
  return `本次已记录 ${parts.join('、')}`;
});

const widgetStatus = props.widget.status;
const widgetDetecting = props.widget.isDetecting;

const gameBarOpenShortcut = computed(
  () => widgetStatus.value?.gameBarOpenShortcut?.trim() || DEFAULT_GAME_BAR_OPEN_SHORTCUT,
);

const gameBarOpenShortcutFromRegistry = computed(
  () => widgetStatus.value?.gameBarOpenShortcutFromRegistry ?? false,
);

const widgetReady = computed(
  () =>
    Boolean(widgetStatus.value?.gameBarInstalled) &&
    Boolean(widgetStatus.value?.installed) &&
    Boolean(widgetStatus.value?.loopbackConfigured),
);

const showInstallFailure = computed(
  () =>
    Boolean(props.widget.error.value) &&
    !props.widget.busy.value &&
    props.widget.phase.value === 'error',
);

function isModeOptionSelected(mode: CounterStrafingDisplayMode) {
  return displayMode.value === mode;
}

function isModeOptionLocked(mode: CounterStrafingDisplayMode) {
  return snapshot.value.listening && !isModeOptionSelected(mode);
}

function selectMode(mode: CounterStrafingDisplayMode) {
  if (isModeOptionLocked(mode)) {
    showToast('请先停止记录', 'warning');
    return;
  }
  if (snapshot.value.listening) return;
  syncModePanelShellHeight(mode);
  setDisplayMode(mode);
  if (mode === 'widget' && showInstallFailure.value) {
    widgetInstallSectionRef.value?.openInstallPanel();
  }
}

const modeOptions: Array<{
  id: CounterStrafingDisplayMode;
  title: string;
  subtitle: string;
  hint: string;
  icon: typeof Monitor;
}> = [
  {
    id: 'widget',
    title: '全屏模式',
    subtitle: 'Game Bar 小组件',
    hint: '全屏模式下使用小组件显示数据',
    icon: LayoutPanelTop,
  },
  {
    id: 'hud',
    title: '窗口 / 无边框全屏',
    subtitle: '游戏内悬浮窗',
    hint: '窗口化、全屏窗口化或无边框全屏',
    icon: AppWindow,
  },
];

async function openGameBarSettings() {
  await openExternalUrl('ms-settings:gaming-gamebar');
}

async function openGameBarStore() {
  await openExternalUrl('https://apps.microsoft.com/detail/9NZKPSTSNW4P');
}

const showWidgetInstallReminder = computed(
  () => displayMode.value === 'widget' && !widgetReady.value && !widgetDetecting.value,
);

const widgetInstallReminderText = computed(() => {
  const status = widgetStatus.value;
  if (!status?.gameBarInstalled) {
    return '全屏模式下需在下方安装 Game Bar 和小组件，才能在游戏里看到实时数据。';
  }
  if (!status.installed) {
    return '全屏模式下建议在下方安装小组件，才能在游戏里看到实时数据。';
  }
  if (!status.loopbackConfigured) {
    return '小组件连接未就绪，建议在下方重新安装以在游戏中显示数据。';
  }
  return '建议在下方完成小组件安装，以便在游戏中查看数据。';
});

function scrollToWidgetInstall() {
  widgetInstallSectionRef.value?.openInstallPanel();
  widgetInstallSectionRef.value?.$el?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
}

const hudPanelRef = ref<HTMLElement | null>(null);
const widgetPanelRef = ref<HTMLElement | null>(null);
const modePanelShellHeight = ref<number | null>(null);

let modePanelResizeObserver: ResizeObserver | null = null;

function measurePanelHeight(mode: CounterStrafingDisplayMode): number {
  const panel = mode === 'hud' ? hudPanelRef.value : widgetPanelRef.value;
  return panel?.offsetHeight ?? 0;
}

function syncModePanelShellHeight(mode: CounterStrafingDisplayMode = displayMode.value) {
  const next = measurePanelHeight(mode);
  if (next > 0) {
    modePanelShellHeight.value = next;
  }
}

watch(displayMode, (mode) => {
  syncModePanelShellHeight(mode);
  void nextTick(() => syncModePanelShellHeight(mode));
});

onMounted(async () => {
  await nextTick();
  syncModePanelShellHeight();

  modePanelResizeObserver = new ResizeObserver(() => {
    syncModePanelShellHeight();
  });
  if (hudPanelRef.value) {
    modePanelResizeObserver.observe(hudPanelRef.value);
  }
  if (widgetPanelRef.value) {
    modePanelResizeObserver.observe(widgetPanelRef.value);
  }
});

onUnmounted(() => {
  modePanelResizeObserver?.disconnect();
  modePanelResizeObserver = null;
});

const modePanelLayerClass =
  'absolute inset-x-0 top-0 transform-gpu px-5 pt-2.5 pb-4 transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none will-change-[opacity]';
</script>

<template>
  <div class="space-y-5">
    <div
      v-if="widgetDetecting"
      class="relative overflow-hidden rounded-2xl border border-accent/40 bg-gradient-to-r from-accent/12 via-accent/6 to-accent/2 px-4 py-3.5 shadow-sm ring-1 ring-accent/15"
      role="status"
      aria-live="polite"
    >
      <div
        class="absolute inset-y-0 left-0 w-1 animate-pulse bg-accent motion-reduce:animate-none"
        aria-hidden="true"
      />
      <div class="flex items-center gap-3 pl-2">
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/18 text-accent shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]"
        >
          <Loader2 class="h-5 w-5 animate-spin" aria-hidden="true" />
        </div>
        <div class="min-w-0">
          <p class="text-[14px] font-semibold tracking-tight text-fg">正在检测环境</p>
          <p class="mt-0.5 text-[12px] leading-snug text-fg-secondary">
            正在扫描 Game Bar 与小组件状态，约需数秒，不影响下方操作
          </p>
        </div>
      </div>
    </div>

    <section
      class="overflow-hidden rounded-2xl border bg-surface shadow-sm transition-colors duration-200"
      :class="snapshot.listening ? 'border-emerald-500/30' : 'border-border'"
    >
      <div
        class="border-b border-border px-5 py-4"
        :class="snapshot.listening ? 'bg-emerald-500/5' : 'bg-elevated/50'"
      >
        <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div class="flex min-w-0 items-start gap-3">
            <div
              class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-200"
              :class="
                snapshot.listening
                  ? 'bg-emerald-500/12 text-emerald-700'
                  : 'bg-accent/10 text-accent'
              "
            >
              <Power class="h-4 w-4" aria-hidden="true" />
            </div>
            <div class="min-w-0">
              <p class="text-[15px] font-semibold leading-snug text-fg">控制开关</p>
              <p class="mt-0.5 text-[12px] leading-snug text-fg-muted">
                {{
                  snapshot.listening
                    ? '正在记录按键，进游戏练习即可'
                    : '选好显示方式后，开启记录再进游戏'
                }}
              </p>
              <div
                class="grid transition-[grid-template-rows] duration-150 ease-out"
                :class="
                  recordSessionSummary && !snapshot.listening
                    ? 'grid-rows-[1fr]'
                    : 'grid-rows-[0fr]'
                "
              >
                <div class="min-h-0 overflow-hidden">
                  <p
                    class="mt-1 text-[11px] font-medium leading-snug text-accent"
                    :aria-hidden="!recordSessionSummary || snapshot.listening"
                  >
                    {{ recordSessionSummary }}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <span
            class="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
            :class="
              snapshot.listening
                ? 'bg-emerald-500/12 text-emerald-700'
                : 'bg-elevated text-fg-muted'
            "
          >
            <span
              class="h-1.5 w-1.5 rounded-full"
              :class="snapshot.listening ? 'bg-emerald-500 animate-pulse' : 'bg-fg-muted/50'"
            />
            {{ snapshot.listening ? '已开启' : '未开启' }}
          </span>
        </div>
      </div>

      <div class="space-y-3 p-5">
        <div class="flex flex-nowrap items-center gap-3">
          <button
            type="button"
            class="inline-flex min-w-28 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold transition-colors duration-200"
            :class="
              snapshot.listening
                ? 'bg-danger/10 text-danger hover:bg-danger/15'
                : 'bg-accent text-white hover:bg-accent-hover'
            "
            :disabled="busy"
            @click="cs.toggleListening()"
          >
            <component :is="snapshot.listening ? Square : Play" class="h-4 w-4" aria-hidden="true" />
            {{ snapshot.listening ? '停止记录' : '开始记录' }}
          </button>
          <div
            class="grid shrink-0 transition-[grid-template-columns] duration-200 ease-out"
            :class="hasAnyRecords ? 'grid-cols-[1fr]' : 'grid-cols-[0fr]'"
          >
            <div class="min-w-0 overflow-hidden">
              <button
                type="button"
                class="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border border-border bg-base px-4 py-2.5 text-[13px] font-medium text-fg-secondary transition-[opacity,colors] duration-150 hover:bg-elevated hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
                :class="hasAnyRecords ? 'opacity-100' : 'pointer-events-none opacity-0'"
                :disabled="busy || !hasAnyRecords"
                :tabindex="hasAnyRecords ? 0 : -1"
                :aria-hidden="!hasAnyRecords"
                @click="cs.clearAllRecords()"
              >
                <RotateCcw class="h-4 w-4 shrink-0" aria-hidden="true" />
                清空本次数据
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="showWidgetInstallReminder"
          class="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/6 px-3.5 py-3"
          role="note"
        >
          <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <p class="text-[12px] leading-relaxed text-fg-secondary">
              {{ widgetInstallReminderText }}
            </p>
            <button
              type="button"
              class="mt-1.5 cursor-pointer text-[12px] font-medium text-accent transition-colors duration-200 hover:text-accent-hover"
              @click="scrollToWidgetInstall()"
            >
              前往安装
            </button>
          </div>
        </div>
      </div>
    </section>

    <div class="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div class="border-b border-border px-5 py-4">
        <div class="flex items-center gap-3">
          <Monitor class="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          <div>
            <p class="text-[15px] font-semibold text-fg">游戏显示模式</p>
            <p class="mt-0.5 text-[12px] text-fg-muted">
              {{
                snapshot.listening
                  ? '记录进行中，请先停止记录再切换显示模式'
                  : '请根据游戏的全屏方式，选择对应的显示方案'
              }}
            </p>
          </div>
        </div>
      </div>

      <div class="grid gap-3 px-5 pt-5 pb-2 sm:grid-cols-2">
        <button
          v-for="option in modeOptions"
          :key="option.id"
          type="button"
          class="group relative flex w-full flex-col rounded-xl border p-4 text-left transition-[border-color,box-shadow,background-color,opacity] duration-200"
          :class="
            isModeOptionSelected(option.id)
              ? 'border-accent bg-accent/6 ring-2 ring-accent/20'
              : isModeOptionLocked(option.id)
                ? 'cursor-not-allowed border-border/70 bg-elevated/30 opacity-55'
                : 'cursor-pointer border-border bg-base hover:border-accent/35 hover:bg-elevated/80'
          "
          :aria-pressed="isModeOptionSelected(option.id)"
          :aria-disabled="isModeOptionLocked(option.id)"
          @click="selectMode(option.id)"
        >
          <div class="flex items-start gap-3">
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-200"
              :class="
                isModeOptionSelected(option.id)
                  ? 'bg-accent text-white'
                  : isModeOptionLocked(option.id)
                    ? 'bg-elevated/80 text-fg-muted/60'
                    : 'bg-elevated text-fg-muted group-hover:text-accent'
              "
            >
              <component :is="option.icon" class="h-5 w-5" aria-hidden="true" />
            </div>
            <div class="min-w-0 flex-1">
              <p
                class="text-[14px] font-semibold"
                :class="isModeOptionLocked(option.id) ? 'text-fg-muted' : 'text-fg'"
              >
                {{ option.title }}
              </p>
              <p
                class="mt-0.5 text-[12px] font-medium"
                :class="isModeOptionLocked(option.id) ? 'text-fg-muted' : 'text-accent'"
              >
                {{ option.subtitle }}
              </p>
              <p
                class="mt-1.5 text-[11px] leading-relaxed"
                :class="isModeOptionLocked(option.id) ? 'text-fg-muted/80' : 'text-fg-muted'"
              >
                {{ option.hint }}
              </p>
            </div>
            <Check
              v-if="isModeOptionSelected(option.id)"
              class="h-5 w-5 shrink-0 text-accent"
              aria-hidden="true"
            />
          </div>
        </button>
      </div>

      <div
        class="relative overflow-hidden rounded-b-2xl bg-elevated/20"
        :style="modePanelShellHeight !== null ? { height: `${modePanelShellHeight}px` } : undefined"
      >
        <div
          ref="hudPanelRef"
          :class="[
            modePanelLayerClass,
            displayMode === 'hud'
              ? 'z-2 opacity-100'
              : 'pointer-events-none z-1 opacity-0',
          ]"
          :aria-hidden="displayMode !== 'hud'"
        >
          <CounterStrafingHudSettings :cs="cs" />
          <p class="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/6 px-3.5 py-2.5 text-[11px] leading-relaxed text-fg-secondary">
            如果游戏里看不到悬浮窗，请把 CS2 改成<strong class="font-medium text-fg">全屏窗口化</strong>或<strong class="font-medium text-fg">无边框全屏</strong>。独占全屏请改用上方「小组件」方式。
          </p>
        </div>

        <div
          ref="widgetPanelRef"
          :class="[
            modePanelLayerClass,
            displayMode === 'widget'
              ? 'z-2 opacity-100'
              : 'pointer-events-none z-1 opacity-0',
          ]"
          :aria-hidden="displayMode !== 'widget'"
        >
            <div class="flex flex-col gap-3">
              <GameBarWidgetDisplaySettings :cs="cs" />

              <div class="flex items-center gap-3">
                <ListChecks class="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                <div>
                  <p class="text-[14px] font-semibold text-fg">小组件开启步骤</p>
                  <p class="text-[12px] text-fg-muted">按顺序完成，就能在全屏游戏里看到数据</p>
                </div>
              </div>

            <div class="space-y-3">
              <div
                class="rounded-xl border px-4 py-3.5 transition-colors duration-200"
                :class="
                  widgetDetecting
                    ? 'border-accent/40 bg-accent/8 ring-1 ring-accent/20'
                    : widgetStatus?.gameBarInstalled
                      ? 'border-emerald-500/25 bg-emerald-500/6'
                      : 'border-warning/30 bg-warning/5'
                "
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="flex min-w-0 gap-3.5">
                    <span
                      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
                      :class="
                        widgetDetecting
                          ? 'bg-accent/15 text-accent'
                          : widgetStatus?.gameBarInstalled
                            ? 'bg-emerald-500/15 text-emerald-700'
                            : 'bg-warning/15 text-amber-700'
                      "
                    >
                      1
                    </span>
                    <div>
                      <p class="text-[13px] font-semibold text-fg">安装 Game Bar</p>
                      <p class="mt-1 text-[12px] leading-relaxed text-fg-muted">
                        {{
                          widgetDetecting
                            ? '正在扫描本机是否已安装…'
                            : widgetStatus?.gameBarInstalled
                              ? '已检测到，可以继续下一步'
                              : '微软自带的游戏工具，小组件运行基础'
                        }}
                      </p>
                    </div>
                  </div>
                  <span
                    class="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                    :class="
                      widgetDetecting
                        ? 'bg-accent/15 px-2.5 py-1 text-[11px] font-semibold text-accent'
                        : widgetStatus?.gameBarInstalled
                          ? 'bg-emerald-500/12 text-emerald-700'
                          : 'bg-warning/12 text-amber-700'
                    "
                  >
                    <Loader2
                      v-if="widgetDetecting"
                      class="h-3 w-3 animate-spin"
                      aria-hidden="true"
                    />
                    {{
                      widgetDetecting
                        ? '检测中'
                        : widgetStatus?.gameBarInstalled
                          ? '已就绪'
                          : '待安装'
                    }}
                  </span>
                </div>
                <div v-if="!widgetDetecting && !widgetStatus?.gameBarInstalled" class="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-white transition-colors duration-200 hover:bg-accent-hover"
                    @click="openGameBarSettings()"
                  >
                    <ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
                    打开系统设置
                  </button>
                  <button
                    type="button"
                    class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-[12px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated"
                    @click="openGameBarStore()"
                  >
                    去微软商店安装
                  </button>
                </div>
              </div>

              <GameBarWidgetInstallSection
                ref="widgetInstallSectionRef"
                :widget="widget"
                :actions-disabled="busy"
              />

              <div
                class="rounded-xl border px-4 py-3.5"
                :class="widgetReady ? 'border-accent/25 bg-accent/4' : 'border-border bg-base'"
              >
                <div class="flex gap-3.5">
                  <span
                    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/12 text-[12px] font-bold text-accent"
                  >
                    3
                  </span>
                  <div class="min-w-0">
                    <p class="text-[13px] font-semibold text-fg">进游戏后这样打开</p>
                    <ol class="mt-2 space-y-2 text-[12px] leading-relaxed text-fg-secondary">
                      <li>回到这里，点<strong class="font-medium text-fg">开始记录</strong></li>
                      <li>
                        进入 CS2，按
                        <GameBarShortcutKbd :shortcut="gameBarOpenShortcut" />
                        打开 Game Bar
                      </li>
                      <li>在「小组件」里找到 <strong class="font-medium text-fg">CS 匹配助手</strong> 并固定</li>
                    </ol>
                    <p
                      v-if="snapshot.listening && widgetReady"
                      class="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-[11px] text-emerald-800"
                    >
                      一切就绪：已开始记录，进游戏打开小组件即可
                    </p>
                    <p
                      v-else-if="widgetReady && !snapshot.listening"
                      class="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-[11px] text-amber-900"
                    >
                      小组件已装好，请点击「开始记录」
                    </p>
                  </div>
                </div>
              </div>

              <p class="rounded-xl border border-border-subtle bg-elevated/50 px-3 py-2.5 text-[11px] leading-relaxed text-fg-muted">
                如果游戏内按
                <GameBarShortcutKbd :shortcut="gameBarOpenShortcut" size="sm" />
                没有出现菜单，请到
                <strong class="font-medium text-fg-secondary">cs2.exe</strong>
                属性中取消勾选「禁用全屏优化」。若仍无法打开，可尝试将游戏改为全屏窗口化。
                <span v-if="!gameBarOpenShortcutFromRegistry">
                  若你已在系统里改过 Game Bar 快捷键，请以
                  <button
                    type="button"
                    class="font-medium text-fg-secondary underline-offset-2 hover:underline"
                    @click="openGameBarSettings()"
                  >
                    系统设置
                  </button>
                  为准。
                </span>
              </p>
            </div>
            </div>
        </div>
      </div>
    </div>
  </div>
</template>
