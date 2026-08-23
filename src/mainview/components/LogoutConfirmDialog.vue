<script setup lang="ts">
import { AlertTriangle, Loader2, LogOut, X } from 'lucide-vue-next';
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { localize as l } from '../i18n';

const props = defineProps<{
  open: boolean;
  busy?: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();

const closeButton = ref<HTMLButtonElement | null>(null);
const cancelButton = ref<HTMLButtonElement | null>(null);
const confirmButton = ref<HTMLButtonElement | null>(null);
let previousFocus: HTMLElement | null = null;

function cancel() {
  if (!props.busy) emit('cancel');
}

function onKeydown(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    cancel();
    return;
  }
  if (event.key !== 'Tab') return;
  const controls = [closeButton.value, cancelButton.value, confirmButton.value].filter(
    (control): control is HTMLButtonElement => Boolean(control && !control.disabled),
  );
  if (!controls.length) return;
  const currentIndex = controls.indexOf(document.activeElement as HTMLButtonElement);
  const nextIndex = event.shiftKey
    ? currentIndex <= 0 ? controls.length - 1 : currentIndex - 1
    : currentIndex === controls.length - 1 ? 0 : currentIndex + 1;
  event.preventDefault();
  controls[nextIndex]?.focus();
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previousFocus = document.activeElement as HTMLElement | null;
      document.body.style.overflow = 'hidden';
      await nextTick();
      cancelButton.value?.focus();
      return;
    }
    document.body.style.overflow = '';
    previousFocus?.focus();
    previousFocus = null;
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
    <Transition name="logout-confirm">
      <div
        v-if="open"
        class="fixed inset-0 z-220 flex items-center justify-center bg-fg/32 p-4"
        role="presentation"
      >
        <button
          type="button"
          class="absolute inset-0 cursor-default border-0 bg-transparent p-0 appearance-none"
          :aria-label="l('取消退出登录', 'Cancel sign out')"
          :disabled="busy"
          @click="cancel"
        />
        <section
          class="logout-confirm__panel relative z-10 w-full max-w-[380px] overflow-hidden rounded-2xl bg-surface shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_16px_48px_rgba(0,0,0,0.18)]"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="logout-confirm-title"
          aria-describedby="logout-confirm-description"
        >
          <button
            ref="closeButton"
            type="button"
            class="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-lg text-fg-muted transition-[color,background-color,scale] duration-150 ease-out hover:bg-elevated hover:text-fg active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 disabled:opacity-50 disabled:active:scale-100"
            :aria-label="l('取消退出登录', 'Cancel sign out')"
            :disabled="busy"
            @click="cancel"
          >
            <X class="h-4 w-4" aria-hidden="true" />
          </button>

          <div class="px-6 pb-5 pt-6">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-danger/10 text-danger">
              <AlertTriangle class="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 id="logout-confirm-title" class="mt-4 text-balance text-[17px] font-semibold text-fg">
              {{ l('退出登录并清除登录数据？', 'Sign out and clear login data?') }}
            </h2>
            <p id="logout-confirm-description" class="mt-2 text-pretty text-[12px] leading-relaxed text-fg-muted">
              {{ l(
                '这会删除设置文件中的加密登录数据和本地完美玩家数据缓存。其他设置不会受到影响，下次使用完美对战平台时需要重新登录。',
                'This removes the encrypted login data from the settings file and clears the local Perfect World player-data cache. Other settings are preserved, and you will need to sign in again next time.',
              ) }}
            </p>
          </div>

          <footer class="flex items-center justify-end gap-2 border-t border-border-subtle bg-elevated/35 px-5 py-4">
            <button
              ref="cancelButton"
              type="button"
              class="min-h-10 rounded-lg px-3.5 text-[12px] font-medium text-fg-secondary transition-[color,background-color,scale] duration-150 ease-out hover:bg-elevated hover:text-fg active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 disabled:opacity-50 disabled:active:scale-100"
              :disabled="busy"
              @click="cancel"
            >
              {{ l('取消', 'Cancel') }}
            </button>
            <button
              ref="confirmButton"
              type="button"
              class="inline-flex min-h-10 items-center gap-2 rounded-lg bg-danger px-4 text-[12px] font-semibold text-white transition-[background-color,opacity,scale] duration-150 ease-out hover:bg-danger/90 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/35 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 disabled:active:scale-100"
              :disabled="busy"
              @click="emit('confirm')"
            >
              <Loader2 v-if="busy" class="h-4 w-4 animate-spin" aria-hidden="true" />
              <LogOut v-else class="h-4 w-4" aria-hidden="true" />
              {{ l('清除并退出', 'Clear and sign out') }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.logout-confirm-enter-active,
.logout-confirm-leave-active {
  transition: opacity 180ms ease-out;
}

.logout-confirm-enter-from,
.logout-confirm-leave-to {
  opacity: 0;
}

.logout-confirm-enter-active .logout-confirm__panel,
.logout-confirm-leave-active .logout-confirm__panel {
  transition:
    opacity 200ms cubic-bezier(0.2, 0, 0, 1),
    transform 200ms cubic-bezier(0.2, 0, 0, 1);
}

.logout-confirm-leave-active .logout-confirm__panel {
  transition-duration: 150ms;
}

.logout-confirm-enter-from .logout-confirm__panel,
.logout-confirm-leave-to .logout-confirm__panel {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}
</style>
