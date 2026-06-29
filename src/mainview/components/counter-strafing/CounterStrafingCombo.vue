<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { comboLabel, assessmentRecordColor, type CounterStrafingRecord } from '@core/counter-strafing/types';

const props = withDefaults(
  defineProps<{
    record: CounterStrafingRecord | null;
    variant?: 'default' | 'hud';
  }>(),
  {
    variant: 'default',
  },
);

const visible = ref(false);
const displayRecord = ref<CounterStrafingRecord | null>(null);
let hideTimer: ReturnType<typeof setTimeout> | null = null;

const label = computed(() => (displayRecord.value ? comboLabel(displayRecord.value) : ''));
const diffText = computed(() =>
  displayRecord.value ? `${displayRecord.value.diffMs > 0 ? '+' : ''}${displayRecord.value.diffMs.toFixed(1)}ms` : '',
);
const accentColor = computed(() =>
  displayRecord.value ? assessmentRecordColor(displayRecord.value) : 'var(--color-accent)',
);

watch(
  () => props.record,
  (record) => {
    if (!record) return;
    displayRecord.value = record;
    visible.value = true;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      visible.value = false;
    }, 500);
  },
);
</script>

<template>
  <Transition name="combo-pop">
    <div
      v-if="visible && displayRecord"
      class="pointer-events-none flex flex-col items-center"
      :class="variant === 'hud' ? 'hud-combo hud-combo-overlay' : ''"
      :style="{ color: accentColor }"
    >
      <p
        class="font-bold"
        :class="
          variant === 'hud'
            ? 'hud-combo-label text-[clamp(18px,4.5vw,26px)] tracking-[0.06em]'
            : 'text-[26px] tracking-normal drop-shadow-sm'
        "
      >
        {{ label }}
      </p>
      <p
        class="font-semibold tabular-nums"
        :class="variant === 'hud' ? 'hud-combo-meta mt-0 text-[11px] leading-tight' : 'mt-0.5 text-[14px] text-fg-secondary'"
      >
        {{ displayRecord.fromKey }} → {{ displayRecord.toKey }}
        <span class="mx-1" :class="variant === 'hud' ? 'text-white/45' : 'text-fg-muted'">·</span>
        {{ diffText }}
      </p>
    </div>
  </Transition>
</template>

<style scoped>
.combo-pop-enter-active {
  transition:
    opacity 100ms ease-out,
    transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.combo-pop-leave-active {
  transition:
    opacity 150ms ease-in,
    transform 150ms ease-in;
}

@media (prefers-reduced-motion: reduce) {
  .combo-pop-enter-active,
  .combo-pop-leave-active {
    transition: none;
  }
}

.combo-pop-enter-from {
  opacity: 0;
  transform: scale(1.35) translateY(4px);
}

.combo-pop-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-8px);
}
</style>
