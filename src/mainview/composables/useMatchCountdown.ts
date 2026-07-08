import { computed, onUnmounted, ref, watch, type MaybeRefOrGetter, toValue } from 'vue';

const TICK_MS = 250;

export function getMatchCountdownSec(deadline: number | undefined, now = Date.now()): number {
  if (deadline == null || !Number.isFinite(deadline)) return 0;
  return Math.max(0, Math.floor((deadline - now) / 1000));
}

export function useMatchCountdown(getDeadline: MaybeRefOrGetter<number | undefined>) {
  const timeLeftSec = ref(0);
  let timer: ReturnType<typeof setInterval> | null = null;

  function tick() {
    timeLeftSec.value = getMatchCountdownSec(toValue(getDeadline));
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start() {
    stop();
    tick();
    const deadline = toValue(getDeadline);
    if (deadline != null && Number.isFinite(deadline) && deadline > Date.now()) {
      timer = setInterval(tick, TICK_MS);
    }
  }

  watch(() => toValue(getDeadline), start, { immediate: true });

  onUnmounted(stop);

  const isActive = computed(() => timeLeftSec.value > 0);
  const isUrgent = computed(() => timeLeftSec.value > 0 && timeLeftSec.value <= 10);

  return { timeLeftSec, isActive, isUrgent };
}
