import { computed, nextTick, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';

/** 0 = 全部显示；1 = 隐藏 ELO 分差；2 = 再隐藏近期胜 */
export type MatchHeaderCompactionLevel = 0 | 1 | 2;

function isOverflowing(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth + 1;
}

export function useMatchHeaderMetaCompaction(
  metaRowRef: Ref<HTMLElement | null>,
  scheduleUpdate: () => unknown[],
) {
  const level = ref<MatchHeaderCompactionLevel>(0);

  const hideEloDiff = computed(() => level.value >= 1);
  const hideRecentWin = computed(() => level.value >= 2);

  let resizeObserver: ResizeObserver | null = null;
  let rafId = 0;

  async function updateCompaction() {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(async () => {
      const el = metaRowRef.value;
      if (!el) return;

      // 从最紧凑态开始，逐步放宽，避免先溢出再收缩的闪烁
      level.value = 2;
      await nextTick();

      level.value = 1;
      await nextTick();
      if (isOverflowing(el)) {
        level.value = 2;
        return;
      }

      level.value = 0;
      await nextTick();
      if (isOverflowing(el)) {
        level.value = 1;
      }
    });
  }

  onMounted(() => {
    const el = metaRowRef.value;
    if (!el) return;

    resizeObserver = new ResizeObserver(() => {
      void updateCompaction();
    });
    resizeObserver.observe(el);
    void updateCompaction();
  });

  onUnmounted(() => {
    cancelAnimationFrame(rafId);
    resizeObserver?.disconnect();
    resizeObserver = null;
  });

  watch(scheduleUpdate, () => {
    void updateCompaction();
  }, { flush: 'post' });

  return { hideEloDiff, hideRecentWin };
}
