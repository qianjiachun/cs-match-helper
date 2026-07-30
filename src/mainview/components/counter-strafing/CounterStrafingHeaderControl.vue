<script setup lang="ts">
import { Gauge, Loader2, Play, Square } from 'lucide-vue-next';
import { computed } from 'vue';
import { localize as l } from '../../i18n';

const props = defineProps<{
  activePage: boolean;
  listening: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{
  open: [];
  toggle: [];
}>();

const openAriaLabel = computed(() => {
  if (props.activePage) {
    return props.listening ? l('急停 HUD（当前，记录中）', 'Counter Strafing HUD (current, recording)') : l('急停 HUD（当前）', 'Counter Strafing HUD (current)');
  }
  return props.listening ? l('打开急停 HUD（记录中）', 'Open Counter Strafing HUD (recording)') : l('打开急停 HUD', 'Open Counter Strafing HUD');
});

const toggleAriaLabel = computed(() => {
  if (props.busy) return l('处理中', 'Working');
  return props.listening ? l('停止记录', 'Stop recording') : l('开始记录', 'Start recording');
});

const shellClass = computed(() => {
  if (props.listening) {
    return 'border-emerald-500/30 bg-emerald-500/6 text-fg shadow-[0_0_0_1px_rgba(16,185,129,0.06)]';
  }
  if (props.activePage) {
    return 'border-accent/25 bg-accent/5 text-accent shadow-[0_0_0_1px_rgba(59,130,246,0.04)]';
  }
  return 'border-border-subtle bg-transparent text-fg-muted hover:border-border hover:bg-elevated/50';
});

const openButtonClass = computed(() => {
  if (props.listening) return 'bg-emerald-500/10 text-fg';
  if (props.activePage) return 'cursor-default bg-accent/7 text-accent';
  return 'cursor-pointer bg-transparent text-fg-muted hover:bg-elevated/60 hover:text-fg-secondary';
});

const gaugeClass = computed(() => {
  if (props.listening) return 'scale-105 text-emerald-600';
  if (props.activePage) return 'scale-100 text-accent';
  return 'scale-100 text-fg-muted';
});

function onOpen() {
  if (props.activePage) return;
  emit('open');
}

function onToggle() {
  if (props.busy) return;
  emit('toggle');
}
</script>

<template>
  <div
    class="cs-header-strafing no-drag relative mx-1.5 flex h-7 shrink-0 items-stretch self-center overflow-hidden rounded-full border transition-[background-color,border-color,box-shadow,color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
    :class="shellClass"
    role="group"
    :aria-label="l('急停 HUD', 'Counter Strafing HUD')"
  >
    <button
      type="button"
      tabindex="-1"
      class="relative flex items-center gap-1.5 py-0 pl-2.5 pr-2 text-[12px] outline-none transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
      :class="openButtonClass"
      :aria-label="openAriaLabel"
      :aria-current="activePage ? 'page' : undefined"
      @mousedown.prevent
      @click="onOpen"
    >
      <span class="relative shrink-0">
        <Gauge
          class="h-3.5 w-3.5 transition-[color,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
          :class="gaugeClass"
          aria-hidden="true"
        />
        <span
          v-if="listening"
          class="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 ring-2 ring-surface sm:hidden"
          aria-hidden="true"
        />
      </span>
      <span class="hidden min-w-0 items-center sm:inline-flex" :class="listening ? 'gap-1.5' : 'gap-0'">
        <span class="shrink-0 whitespace-nowrap font-normal">{{ l('急停 HUD', 'Counter Strafing HUD') }}</span>
        <div
          class="grid min-w-0 transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          :class="listening ? 'grid-cols-[1fr]' : 'grid-cols-[0fr]'"
          aria-hidden="true"
        >
          <div class="min-w-0 overflow-hidden">
            <span
              class="cs-header-strafing__badge inline-flex w-max shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
              :class="listening ? 'cs-header-strafing__badge--visible' : 'cs-header-strafing__badge--hidden'"
            >
              <span
                class="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500"
                aria-hidden="true"
              />
              {{ l('记录中', 'Recording') }}
            </span>
          </div>
        </div>
      </span>
    </button>

    <div
      class="w-px self-stretch transition-colors duration-200"
      :class="listening ? 'bg-emerald-500/25' : activePage ? 'bg-accent/20' : 'bg-border-subtle'"
      aria-hidden="true"
    />

    <button
      type="button"
      tabindex="-1"
      class="relative flex w-8 cursor-pointer items-center justify-center outline-none transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60"
      :class="listening ? 'text-danger hover:bg-danger/8' : 'text-accent hover:bg-accent/10'"
      :aria-label="toggleAriaLabel"
      :aria-pressed="listening"
      :disabled="busy"
      @mousedown.prevent
      @click="onToggle"
    >
      <span class="relative flex h-3.5 w-3.5 items-center justify-center">
        <span
          class="cs-header-strafing__icon absolute inset-0 flex items-center justify-center"
          :class="busy ? 'cs-header-strafing__icon--visible' : 'cs-header-strafing__icon--hidden'"
        >
          <Loader2 class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        </span>
        <span
          class="cs-header-strafing__icon absolute inset-0 flex items-center justify-center"
          :class="
            !busy && !listening
              ? 'cs-header-strafing__icon--visible'
              : 'cs-header-strafing__icon--hidden'
          "
        >
          <Play class="h-3.5 w-3.5 translate-x-[0.5px]" aria-hidden="true" />
        </span>
        <span
          class="cs-header-strafing__icon absolute inset-0 flex items-center justify-center"
          :class="
            !busy && listening
              ? 'cs-header-strafing__icon--visible'
              : 'cs-header-strafing__icon--hidden'
          "
        >
          <Square class="h-3 w-3 fill-current" aria-hidden="true" />
        </span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.cs-header-strafing__badge {
  transition:
    opacity 180ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 180ms cubic-bezier(0.16, 1, 0.3, 1),
    filter 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.cs-header-strafing__badge--visible {
  opacity: 1;
  transform: translateX(0);
  filter: blur(0);
  transition-delay: 120ms;
}

.cs-header-strafing__badge--hidden {
  opacity: 0;
  transform: translateX(-4px);
  filter: blur(2px);
  pointer-events: none;
  transition-delay: 0ms;
}

.cs-header-strafing__icon {
  transition:
    opacity 200ms cubic-bezier(0.2, 0, 0, 1),
    transform 200ms cubic-bezier(0.2, 0, 0, 1),
    filter 200ms cubic-bezier(0.2, 0, 0, 1);
}

.cs-header-strafing__icon--visible {
  opacity: 1;
  transform: scale(1);
  filter: blur(0);
}

.cs-header-strafing__icon--hidden {
  opacity: 0;
  transform: scale(0.25);
  filter: blur(4px);
  pointer-events: none;
}

</style>
