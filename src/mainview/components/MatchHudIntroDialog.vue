<script setup lang="ts">
import {
  CheckCircle2,
  ChartSpline,
  Copy,
  ExternalLink,
  Gauge,
  MoveHorizontal,
  ShieldAlert,
  Sparkles,
  X,
  Zap,
} from 'lucide-vue-next';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { openExternalUrl } from '../native';
import { useCopyFeedback } from '../composables/useCopyFeedback';
import { localize as l } from '../i18n';
import MatchHudDemoStage from './MatchHudDemoStage.vue';
import MatchHudIcon from './MatchHudIcon.vue';

const HUD_OFFICIAL_URL = 'http://hud.fkbuff.com/';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { copyText } = useCopyFeedback();

const activeTab = ref<'counter' | 'recoil' | 'airSync'>('counter');

function close() {
  emit('close');
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) {
    event.preventDefault();
    close();
  }
}

async function handleOpenOfficial() {
  await openExternalUrl(HUD_OFFICIAL_URL);
}

async function handleCopyLink() {
  await copyText(HUD_OFFICIAL_URL, {
    successMessage: l('已复制对局 HUD 官网链接', 'Match HUD official website URL copied'),
  });
}

watch(
  () => props.open,
  (open) => {
    document.body.style.overflow = open ? 'hidden' : '';
  },
  { immediate: true },
);

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  document.body.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-210 flex items-center justify-center bg-fg/40 p-4 backdrop-blur-xs"
        role="presentation"
      >
        <button
          type="button"
          class="absolute inset-0 cursor-default border-0 bg-transparent p-0 appearance-none"
          :aria-label="l('关闭', 'Close')"
          @click="close"
        />

        <div
          class="match-hud-intro-dialog relative z-10 flex max-h-[90vh] w-full max-w-160 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-[rgb(38_33_35/0.12)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="match-hud-dialog-title"
          @click.stop
        >
          <header class="relative shrink-0 border-b border-border-subtle bg-elevated/40 px-6 py-4.5 pr-14">
            <div class="match-hud-intro-dialog__header-glow pointer-events-none absolute inset-0" aria-hidden="true" />

            <div class="relative flex items-center gap-3.5">
              <MatchHudIcon size="badge" />
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h2
                    id="match-hud-dialog-title"
                    class="text-[17px] font-bold tracking-tight text-fg"
                  >
                    {{ l('CS 对局 HUD', 'CS Match HUD') }}
                  </h2>
                  <span class="match-hud-intro-dialog__badge inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                    <Sparkles class="h-3 w-3" />
                    {{ l('支持全屏模式', 'Fullscreen supported') }}
                  </span>
                </div>
                <p class="mt-0.5 text-[12px] text-fg-secondary">
                  {{ l('面向 CS2 的专业 HUD 套件 · 枪法与身法实时可视化 · 零封号风险安全架构', 'Pro HUD Workspace for CS2 · Realtime Mechanics Feedback · Zero Injection Safety') }}
                </p>
              </div>
            </div>

            <button
              type="button"
              class="absolute right-3 top-3 z-20 flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-colors duration-150 hover:bg-surface hover:text-fg hover:shadow-xs"
              :aria-label="l('关闭', 'Close')"
              @click.stop="close"
            >
              <X class="h-4 w-4" />
            </button>

            <div class="relative mt-4 flex items-stretch gap-1.5 rounded-xl border border-border/80 bg-surface/80 p-1">
              <button
                type="button"
                class="flex h-9 min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition-all"
                :class="activeTab === 'counter' ? 'match-hud-intro-dialog__tab-active shadow-xs font-semibold' : 'text-fg-secondary hover:bg-elevated hover:text-fg'"
                @click="activeTab = 'counter'"
              >
                <Gauge class="h-3.5 w-3.5 shrink-0" />
                <span class="whitespace-nowrap">{{ l('急停与开枪稳定', 'Counter-Strafe & Stability') }}</span>
              </button>
              <button
                type="button"
                class="flex h-9 min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition-all"
                :class="activeTab === 'recoil' ? 'match-hud-intro-dialog__tab-active shadow-xs font-semibold' : 'text-fg-secondary hover:bg-elevated hover:text-fg'"
                @click="activeTab = 'recoil'"
              >
                <ChartSpline class="h-3.5 w-3.5 shrink-0" />
                <span class="whitespace-nowrap">{{ l('压枪轨迹', 'Recoil Trace') }}</span>
              </button>
              <button
                type="button"
                class="flex h-9 min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition-all"
                :class="activeTab === 'airSync' ? 'match-hud-intro-dialog__tab-active shadow-xs font-semibold' : 'text-fg-secondary hover:bg-elevated hover:text-fg'"
                @click="activeTab = 'airSync'"
              >
                <MoveHorizontal class="h-3.5 w-3.5 shrink-0" />
                <span class="whitespace-nowrap">{{ l('空中加速同步率', 'Air Accel Sync') }}</span>
              </button>
            </div>
          </header>

          <div class="flex-1 space-y-3 overflow-y-auto p-6 text-fg">
            <div class="match-hud-intro-dialog__tab-pane space-y-3">
              <div class="h-52 shrink-0 overflow-hidden rounded-xl border border-black/8 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]">
                <MatchHudDemoStage :kind="activeTab" :active="open" />
              </div>

              <div class="match-hud-intro-dialog__tab-detail">
                <div class="grid h-full grid-cols-2 gap-2.5">
                  <template v-if="activeTab === 'counter'">
                    <div class="match-hud-intro-dialog__detail-card">
                      <h4 class="flex items-center gap-1.5 text-[12.5px] font-semibold text-fg">
                        <Zap class="match-hud-intro-dialog__accent-icon h-3.5 w-3.5 shrink-0" />
                        {{ l('同轴反向按键时机', 'Opposite Key Transition') }}
                      </h4>
                      <p class="mt-1 text-[11px] leading-relaxed text-fg-muted">
                        {{ l('精确毫秒级监测松开 A 键到按下 D 键的间隙，区分完美、优秀、偏早与偏晚。', 'Sub-millisecond tracking between key release and opposite press, grading timing accuracy.') }}
                      </p>
                    </div>
                    <div class="match-hud-intro-dialog__detail-card">
                      <h4 class="flex items-center gap-1.5 text-[12.5px] font-semibold text-fg">
                        <ShieldAlert class="match-hud-intro-dialog__accent-icon h-3.5 w-3.5 shrink-0" />
                        {{ l('CS2 官方 GSI 智能过滤', 'CS2 Official GSI Filtering') }}
                      </h4>
                      <p class="mt-1 text-[11px] leading-relaxed text-fg-muted">
                        {{ l('自动识别持刀、投掷物、死亡观战、冻结期与切出游戏，只保留有效枪法样本。', 'Context-aware filters for knives, grenades, spectating, freeze-time, and alt-tab states.') }}
                      </p>
                    </div>
                  </template>

                  <template v-else-if="activeTab === 'recoil'">
                    <div class="match-hud-intro-dialog__detail-card">
                      <h4 class="flex items-center gap-1.5 text-[12.5px] font-semibold text-fg">
                        <ChartSpline class="match-hud-intro-dialog__accent-icon h-3.5 w-3.5 shrink-0" />
                        {{ l('纯输入采集', 'Raw Input Capture') }}
                      </h4>
                      <p class="mt-1 text-[11px] leading-relaxed text-fg-muted">
                        {{ l('连续连发开火时自动记录鼠标拖拽轨迹，复盘压枪手感与纵向补偿是否足够。', 'Records mouse drag paths during spray bursts to review pull consistency and vertical compensation.') }}
                      </p>
                    </div>
                    <div class="match-hud-intro-dialog__detail-card">
                      <h4 class="flex items-center gap-1.5 text-[12.5px] font-semibold text-fg">
                        <Sparkles class="match-hud-intro-dialog__accent-icon h-3.5 w-3.5 shrink-0" />
                        {{ l('弹道模型对齐', 'Pattern Mirroring') }}
                      </h4>
                      <p class="mt-1 text-[11px] leading-relaxed text-fg-muted">
                        {{ l('实时计算与枪械反向弹道的吻合度、横向散布控制与复现重复性。', 'Measures alignment with inverted recoil profiles, lateral spread control, and repeatability.') }}
                      </p>
                    </div>
                  </template>

                  <template v-else>
                    <div class="match-hud-intro-dialog__detail-card">
                      <h4 class="flex items-center gap-1.5 text-[12.5px] font-semibold text-fg">
                        <MoveHorizontal class="match-hud-intro-dialog__accent-icon h-3.5 w-3.5 shrink-0" />
                        {{ l('空中变向检测', 'Air Strafe Detection') }}
                      </h4>
                      <p class="mt-1 text-[11px] leading-relaxed text-fg-muted">
                        {{ l('自动识别起跳、空中变向与着地判定，按 KZ 口径推算空中窗口。', 'Detects jumps, mid-air direction changes, and landings with a KZ-style inferred air window.') }}
                      </p>
                    </div>
                    <div class="match-hud-intro-dialog__detail-card">
                      <h4 class="flex items-center gap-1.5 text-[12.5px] font-semibold text-fg">
                        <Gauge class="match-hud-intro-dialog__accent-icon h-3.5 w-3.5 shrink-0" />
                        {{ l('键鼠同向匹配', 'Keys & Yaw Sync') }}
                      </h4>
                      <p class="mt-1 text-[11px] leading-relaxed text-fg-muted">
                        {{ l('实时分析空中阶段每一次切键与鼠标视角转动的同步率。', 'Scores whether each mid-air key switch matches the direction of mouse yaw rotation.') }}
                      </p>
                    </div>
                  </template>
                </div>
              </div>
            </div>

            <div class="flex items-center rounded-xl border border-dashed border-border bg-elevated/30 px-4 py-2">
              <div class="flex min-w-0 items-center gap-2 text-[12px] text-fg-secondary">
                <Sparkles class="match-hud-intro-dialog__warning-icon h-4 w-4 shrink-0" />
                <span class="font-medium">{{ l('更多对局 HUD 模块正在持续更新中', 'More HUD modules in active development') }}</span>
              </div>
            </div>

            <div class="match-hud-intro-dialog__link-panel flex items-center justify-between rounded-xl px-4 py-3">
              <div class="flex min-w-0 items-center gap-2.5">
                <CheckCircle2 class="match-hud-intro-dialog__accent-icon h-4.5 w-4.5 shrink-0" />
                <div class="min-w-0">
                  <div class="text-[12px] font-semibold text-fg">
                    {{ l('CS 对局 HUD 官方网站', 'CS Match HUD Official Portal') }}
                  </div>
                  <a
                    :href="HUD_OFFICIAL_URL"
                    class="match-hud-intro-dialog__link truncate font-mono text-[11px] font-medium underline-offset-2 hover:underline"
                    @click.prevent="handleOpenOfficial"
                  >
                    http://hud.fkbuff.com/
                  </a>
                </div>
              </div>
              <button
                type="button"
                class="match-hud-intro-dialog__copy-btn flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border bg-surface px-3 py-1.5 text-[11px] font-medium shadow-xs transition-colors"
                :title="l('复制官网链接', 'Copy official URL')"
                @click="handleCopyLink"
              >
                <Copy class="h-3.5 w-3.5" />
                <span>{{ l('复制链接', 'Copy Link') }}</span>
              </button>
            </div>
          </div>

          <footer class="flex items-center justify-between border-t border-border-subtle bg-elevated/50 px-6 py-4">
            <span class="text-[11.5px] text-fg-muted">
              {{ l('完全独立运行，与匹配助手互不干扰', 'Runs independently alongside Match Helper') }}
            </span>
            <div class="flex items-center gap-2.5">
              <button
                type="button"
                class="cursor-pointer rounded-xl border border-border bg-surface px-4 py-2 text-[12px] font-medium text-fg-secondary shadow-xs transition-colors duration-150 hover:bg-elevated hover:text-fg"
                @click="close"
              >
                {{ l('关闭', 'Close') }}
              </button>
              <button
                type="button"
                class="match-hud-intro-dialog__btn-primary flex cursor-pointer items-center gap-1.5 rounded-xl px-5 py-2 text-[12.5px] font-semibold text-white transition-all duration-150 active:scale-[0.98]"
                @click="handleOpenOfficial"
              >
                <span>{{ l('前往官网下载使用', 'Visit Official Site') }}</span>
                <ExternalLink class="h-3.5 w-3.5" />
              </button>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Warm Berry & Oat — scoped to Match HUD intro dialog */
.match-hud-intro-dialog {
  --mh-berry: #e0567c;
  --mh-berry-hover: #d0456b;
  --mh-berry-muted: #f47c9e;
  --mh-berry-subtle: rgb(224 86 124 / 0.08);
  --mh-berry-subtle-strong: rgb(224 86 124 / 0.12);
  --mh-berry-border: rgb(224 86 124 / 0.22);
  --mh-berry-shadow: rgb(224 86 124 / 0.28);
  --mh-oat-warning: #e89828;
}

.match-hud-intro-dialog__tab-pane {
  min-height: 20rem;
}

.match-hud-intro-dialog__tab-detail {
  min-height: 6.25rem;
}

.match-hud-intro-dialog__detail-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 6.25rem;
  border-radius: 0.75rem;
  border: 1px solid var(--color-border-subtle, rgb(0 0 0 / 0.06));
  background: color-mix(in srgb, var(--color-elevated, #f5f5f4) 70%, transparent);
  padding: 0.75rem;
}

.match-hud-intro-dialog__header-glow {
  background: linear-gradient(
    90deg,
    rgb(224 86 124 / 0.14) 0%,
    rgb(247 198 111 / 0.08) 42%,
    transparent 100%
  );
}

.match-hud-intro-dialog__badge {
  background: var(--mh-berry-subtle-strong);
  color: #c04d6f;
  box-shadow: inset 0 0 0 1px var(--mh-berry-border);
}

.match-hud-intro-dialog__tab-active {
  background: var(--mh-berry);
  color: #fff;
}

.match-hud-intro-dialog__tab-active:hover {
  background: var(--mh-berry-hover);
}

.match-hud-intro-dialog__accent-icon {
  color: var(--mh-berry);
}

.match-hud-intro-dialog__warning-icon {
  color: var(--mh-oat-warning);
}

.match-hud-intro-dialog__link-panel {
  border: 1px solid var(--mh-berry-border);
  background: var(--mh-berry-subtle);
}

.match-hud-intro-dialog__link {
  color: #c04d6f;
}

.match-hud-intro-dialog__link:hover {
  color: var(--mh-berry-hover);
}

.match-hud-intro-dialog__copy-btn {
  border-color: var(--mh-berry-border);
  color: #c04d6f;
}

.match-hud-intro-dialog__copy-btn:hover {
  background: var(--mh-berry-subtle-strong);
  color: var(--mh-berry-hover);
}

.match-hud-intro-dialog__btn-primary {
  background: var(--mh-berry);
  box-shadow: 0 1px 3px var(--mh-berry-shadow);
}

.match-hud-intro-dialog__btn-primary:hover {
  background: var(--mh-berry-hover);
}
</style>
