<script setup lang="ts">
import { Check, ChevronUp, Languages } from 'lucide-vue-next';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { currentLocale, setLocale, type AppLocale } from '../../i18n';
import { setAppLocale } from '../../native';

const { t, locale } = useI18n();
const rootRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);
const open = ref(false);

const options: Array<{ value: AppLocale; labelKey: string }> = [
  { value: 'zh-CN', labelKey: 'common.chinese' },
  { value: 'en-US', labelKey: 'common.english' },
];

const selectedLocale = computed<AppLocale>(() => {
  void locale.value;
  return currentLocale();
});

const currentLabel = computed(() => {
  const option = options.find((item) => item.value === selectedLocale.value) ?? options[0];
  return t(option.labelKey);
});

async function chooseLanguage(value: AppLocale) {
  open.value = false;
  await setLocale(value, setAppLocale);
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!rootRef.value?.contains(event.target as Node)) open.value = false;
}

function onDocumentKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    open.value = false;
    triggerRef.value?.focus();
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('keydown', onDocumentKeyDown);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  document.removeEventListener('keydown', onDocumentKeyDown);
});
</script>

<template>
  <div ref="rootRef" class="relative">
    <Transition
      enter-active-class="transition-[opacity,transform] duration-150 ease-out"
      enter-from-class="translate-y-1 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition-[opacity,transform] duration-100 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-1 opacity-0"
    >
      <div
        v-if="open"
        class="absolute inset-x-0 bottom-full z-30 mb-2 overflow-hidden rounded-lg bg-surface p-1 shadow-[0_8px_28px_rgb(15_23_42/0.14),0_0_0_1px_rgb(15_23_42/0.06)]"
        role="menu"
        :aria-label="t('settings.languageTitle')"
      >
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          role="menuitemradio"
          :aria-checked="selectedLocale === option.value"
          class="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-[12px] font-medium transition-[color,background-color,scale] duration-150 active:scale-[0.96]"
          :class="selectedLocale === option.value ? 'bg-accent/10 text-accent' : 'text-fg-secondary hover:bg-elevated hover:text-fg'"
          @click="chooseLanguage(option.value)"
        >
          <span class="flex h-5 w-5 shrink-0 items-center justify-center">
            <Check
              class="h-3.5 w-3.5 transition-[opacity,scale,filter] duration-150"
              :class="selectedLocale === option.value ? 'scale-100 opacity-100 blur-0' : 'scale-25 opacity-0 blur-xs'"
              aria-hidden="true"
            />
          </span>
          <span class="min-w-0 flex-1 truncate">{{ t(option.labelKey) }}</span>
        </button>
      </div>
    </Transition>

    <button
      ref="triggerRef"
      type="button"
      class="flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-left text-fg-secondary transition-[color,background-color,scale] duration-150 hover:bg-elevated hover:text-fg active:scale-[0.96]"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="open = !open"
    >
      <Languages class="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
      <span class="min-w-0 flex-1 truncate text-[12px] font-medium">{{ currentLabel }}</span>
      <ChevronUp
        class="h-3.5 w-3.5 shrink-0 text-fg-muted transition-transform duration-150"
        :class="open ? 'rotate-0' : 'rotate-180'"
        aria-hidden="true"
      />
    </button>
  </div>
</template>
