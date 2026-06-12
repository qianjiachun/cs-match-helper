<script setup lang="ts">
defineProps<{
  modelValue: boolean;
  label: string;
  description?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();
</script>

<template>
  <label
    class="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3.5 transition-colors duration-200"
    :class="disabled ? 'cursor-not-allowed opacity-50' : 'hover:border-accent/30 hover:bg-elevated/60'"
  >
    <div class="min-w-0">
      <p class="text-[13px] font-medium text-fg">{{ label }}</p>
      <p v-if="description" class="mt-0.5 text-[11px] leading-relaxed text-fg-muted">
        {{ description }}
      </p>
    </div>
    <span class="relative inline-flex shrink-0 items-center">
      <input
        type="checkbox"
        class="peer sr-only"
        :checked="modelValue"
        :disabled="disabled"
        :aria-label="label"
        @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
      />
      <span
        class="relative inline-block h-6 w-11 rounded-full bg-slate-300 transition-colors duration-200 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-200 peer-checked:bg-accent peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 peer-disabled:opacity-60"
        aria-hidden="true"
      />
    </span>
  </label>
</template>
